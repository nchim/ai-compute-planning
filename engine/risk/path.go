package risk

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"

	"github.com/nchim/ai-compute-planning/engine/pb"
)

// PathError says why a dotted input_path does not name a numeric SitePlan field. Known lists the
// fields of the innermost message that was reached, so the agent can pick a real one.
type PathError struct {
	Path   string
	Reason string
	Known  []string
}

func (e *PathError) Error() string {
	return fmt.Sprintf("input_path %q: %s (known fields: %s)", e.Path, e.Reason, strings.Join(e.Known, ", "))
}

// SetNumeric writes v into the numeric field named by a dotted protojson-style path such as
// "revenue.compute.gpu_hour_price" or "power.sources[0].available_month". Integer fields are
// rounded (half away from zero); unset intermediate messages are created.
func SetNumeric(plan *pb.SitePlan, path string, v float64) error {
	t, err := resolve(plan.ProtoReflect(), path, true)
	if err != nil {
		return err
	}
	t.set(v)
	return nil
}

// GetNumeric reads the numeric field named by path without mutating the plan.
func GetNumeric(plan *pb.SitePlan, path string) (float64, error) {
	t, err := resolve(plan.ProtoReflect(), path, false)
	if err != nil {
		return 0, err
	}
	return t.get(), nil
}

// target is a resolved numeric leaf: a scalar field, or one element of a scalar list (idx ≥ 0).
type target struct {
	msg protoreflect.Message
	fd  protoreflect.FieldDescriptor
	idx int
}

func (t target) get() float64 {
	v := t.msg.Get(t.fd)
	if t.idx >= 0 {
		v = v.List().Get(t.idx)
	}
	return toFloat(t.fd, v)
}

func (t target) set(x float64) {
	v := fromFloat(t.fd, x)
	if t.idx >= 0 {
		t.msg.Mutable(t.fd).List().Set(t.idx, v)
		return
	}
	t.msg.Set(t.fd, v)
}

// resolve walks the dotted path from root. With mutable=true, missing intermediate messages are
// created (so a later set lands in the plan); with false the walk is read-only.
func resolve(root protoreflect.Message, path string, mutable bool) (target, error) {
	segs := strings.Split(path, ".")
	msg := root
	for i, seg := range segs {
		name, idx, err := parseSegment(seg)
		if err != nil {
			return target{}, pathErr(path, msg, err.Error())
		}
		fd := fieldByName(msg, name)
		if fd == nil {
			return target{}, pathErr(path, msg, fmt.Sprintf("no field %q", name))
		}
		if idx >= 0 {
			if !fd.IsList() {
				return target{}, pathErr(path, msg, fmt.Sprintf("%q is not a list", name))
			}
			if n := msg.Get(fd).List().Len(); idx >= n {
				return target{}, pathErr(path, msg, fmt.Sprintf("%s[%d] is out of range (length %d)", name, idx, n))
			}
		} else if fd.IsList() {
			return target{}, pathErr(path, msg, fmt.Sprintf("%q is a list; index it like %s[0]", name, name))
		}
		last := i == len(segs)-1
		if last {
			if fd.Kind() == protoreflect.MessageKind {
				return target{}, pathErr(path, childMessage(msg, fd, idx, false), fmt.Sprintf("%q is a message; name one of its numeric fields", name))
			}
			if !numeric(fd) {
				return target{}, pathErr(path, msg, fmt.Sprintf("%q is not a numeric field", name))
			}
			return target{msg: msg, fd: fd, idx: idx}, nil
		}
		if fd.Kind() != protoreflect.MessageKind {
			return target{}, pathErr(path, msg, fmt.Sprintf("%q is a %s, not a message", name, fd.Kind()))
		}
		msg = childMessage(msg, fd, idx, mutable)
	}
	return target{}, pathErr(path, root, "empty path")
}

func childMessage(msg protoreflect.Message, fd protoreflect.FieldDescriptor, idx int, mutable bool) protoreflect.Message {
	if idx >= 0 {
		return msg.Get(fd).List().Get(idx).Message()
	}
	if mutable {
		return msg.Mutable(fd).Message()
	}
	return msg.Get(fd).Message()
}

// parseSegment splits "sources[3]" into ("sources", 3); a plain name yields idx −1.
func parseSegment(seg string) (string, int, error) {
	open := strings.IndexByte(seg, '[')
	if open < 0 {
		return seg, -1, nil
	}
	if !strings.HasSuffix(seg, "]") {
		return "", 0, fmt.Errorf("malformed index in %q", seg)
	}
	idx, err := strconv.Atoi(seg[open+1 : len(seg)-1])
	if err != nil || idx < 0 {
		return "", 0, fmt.Errorf("index in %q must be a non-negative integer", seg)
	}
	return seg[:open], idx, nil
}

// fieldByName accepts proto names (gpu_hour_price) and protojson names (gpuHourPrice).
func fieldByName(msg protoreflect.Message, name string) protoreflect.FieldDescriptor {
	fields := msg.Descriptor().Fields()
	if fd := fields.ByName(protoreflect.Name(name)); fd != nil {
		return fd
	}
	return fields.ByJSONName(name)
}

func numeric(fd protoreflect.FieldDescriptor) bool {
	switch fd.Kind() {
	case protoreflect.DoubleKind, protoreflect.FloatKind, protoreflect.Int32Kind, protoreflect.Int64Kind:
		return true
	}
	return false
}

func toFloat(fd protoreflect.FieldDescriptor, v protoreflect.Value) float64 {
	switch fd.Kind() {
	case protoreflect.Int32Kind, protoreflect.Int64Kind:
		return float64(v.Int())
	}
	return v.Float()
}

func fromFloat(fd protoreflect.FieldDescriptor, x float64) protoreflect.Value {
	switch fd.Kind() {
	case protoreflect.FloatKind:
		return protoreflect.ValueOfFloat32(float32(x))
	case protoreflect.Int32Kind:
		return protoreflect.ValueOfInt32(int32(math.Round(x)))
	case protoreflect.Int64Kind:
		return protoreflect.ValueOfInt64(int64(math.Round(x)))
	}
	return protoreflect.ValueOfFloat64(x)
}

func pathErr(path string, msg protoreflect.Message, reason string) *PathError {
	fields := msg.Descriptor().Fields()
	known := make([]string, 0, fields.Len())
	for i := 0; i < fields.Len(); i++ {
		known = append(known, string(fields.Get(i).Name()))
	}
	sort.Strings(known)
	return &PathError{Path: path, Reason: reason, Known: known}
}

func clone(plan *pb.SitePlan) *pb.SitePlan { return proto.Clone(plan).(*pb.SitePlan) }
