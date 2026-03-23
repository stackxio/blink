import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
}

export default function MarkdownPreview({ content }: Props) {
  return (
    <div className="md-preview">
      <div className="md-preview__content">
        <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
      </div>
    </div>
  );
}
