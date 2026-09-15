import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const plugins = [remarkGfm];

/**
 * Renders the Copilot's markdown (GitHub flavour: tables, task lists, strikethrough) to React
 * elements. react-markdown never emits raw HTML from the source, so model output cannot inject
 * markup; links open in a new tab.
 */
export function Markdown(props: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={plugins}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="md-table">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {props.text}
      </ReactMarkdown>
    </div>
  );
}
