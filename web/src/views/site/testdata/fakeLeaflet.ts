import type * as L from "leaflet";

/**
 * A recording stand-in for the `leaflet` module: jsdom has no layout, so the real library cannot
 * size a map. Layers record what the provider asked for; `registry` exposes the maps created so
 * tests assert on layers, controls, popups and events instead of pixels.
 */
type Handler = (event?: unknown) => void;

class FakeEvented {
  readonly handlers = new Map<string, Handler[]>();
  on(type: string, fn: Handler) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
    return this;
  }
  off() {
    return this;
  }
  fire(type: string, event?: unknown) {
    for (const fn of this.handlers.get(type) ?? []) fn(event);
    return this;
  }
}

export class FakeLayer extends FakeEvented {
  popup: string | null = null;
  tooltip: string | null = null;
  constructor(
    readonly kind: string,
    readonly latlngs: unknown,
    readonly options: Record<string, unknown> = {},
  ) {
    super();
  }
  addTo(target: FakeMap | FakeLayerGroup) {
    target.addLayer(this);
    return this;
  }
  bindPopup(content: string) {
    this.popup = content;
    return this;
  }
  bindTooltip(content: string) {
    this.tooltip = content;
    return this;
  }
  remove() {
    return this;
  }
}

export class FakeLayerGroup extends FakeLayer {
  readonly children: FakeLayer[] = [];
  constructor(options: Record<string, unknown> = {}) {
    super("layerGroup", null, options);
  }
  addLayer(layer: FakeLayer) {
    this.children.push(layer);
    return this;
  }
}

export class FakeTileLayer extends FakeLayer {
  url: string;
  constructor(url: string, options: Record<string, unknown>) {
    super("tileLayer", null, options);
    this.url = url;
  }
  setUrl(url: string) {
    this.url = url;
    return this;
  }
}

export class FakeControl {
  constructor(readonly kind: string, readonly options: Record<string, unknown> = {}) {}
  addTo(map: FakeMap) {
    map.controls.push(this);
    return this;
  }
}

export class FakeMap extends FakeEvented {
  readonly layers = new Set<FakeLayer>();
  readonly controls: FakeControl[] = [];
  readonly fitBoundsCalls: unknown[] = [];
  removed = false;
  constructor(readonly container: HTMLElement, readonly options: Record<string, unknown>) {
    super();
  }
  addLayer(layer: FakeLayer) {
    this.layers.add(layer);
    return this;
  }
  removeLayer(layer: FakeLayer) {
    this.layers.delete(layer);
    return this;
  }
  hasLayer(layer: FakeLayer) {
    return this.layers.has(layer);
  }
  fitBounds(bounds: unknown) {
    this.fitBoundsCalls.push(bounds);
    return this;
  }
  invalidateSizeCalls = 0;
  invalidateSize() {
    this.invalidateSizeCalls++;
    return this;
  }
  remove() {
    this.removed = true;
    return this;
  }
}

export const registry: { maps: FakeMap[] } = { maps: [] };

/** Clears the recorded maps between tests. */
export function resetFakeLeaflet(): void {
  registry.maps.length = 0;
}

/** Every leaf layer on the map, flattening layer groups. */
export function leafLayers(map: FakeMap): FakeLayer[] {
  const out: FakeLayer[] = [];
  const walk = (layer: FakeLayer) => {
    if (layer instanceof FakeLayerGroup) layer.children.forEach(walk);
    else out.push(layer);
  };
  for (const layer of map.layers) walk(layer);
  return out;
}

/** The module shape `import * as L from "leaflet"` sees under `vi.mock`. */
export const fakeLeafletModule = {
  map: (el: HTMLElement, options: Record<string, unknown> = {}) => {
    const map = new FakeMap(el, options);
    registry.maps.push(map);
    return map as unknown as L.Map;
  },
  tileLayer: (url: string, options: Record<string, unknown> = {}) => new FakeTileLayer(url, options) as unknown as L.TileLayer,
  layerGroup: (_layers?: unknown[], options: Record<string, unknown> = {}) => new FakeLayerGroup(options) as unknown as L.LayerGroup,
  circle: (latlng: unknown, options: Record<string, unknown> = {}) => new FakeLayer("circle", latlng, options) as unknown as L.Circle,
  circleMarker: (latlng: unknown, options: Record<string, unknown> = {}) =>
    new FakeLayer("circleMarker", latlng, options) as unknown as L.CircleMarker,
  polyline: (latlngs: unknown, options: Record<string, unknown> = {}) => new FakeLayer("polyline", latlngs, options) as unknown as L.Polyline,
  control: {
    scale: (options: Record<string, unknown> = {}) => new FakeControl("scale", options) as unknown as L.Control.Scale,
  },
};
