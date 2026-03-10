pub struct ClipboardConnector;

impl ClipboardConnector {
    pub fn new() -> Self {
        Self
    }

    pub fn read(&self) -> anyhow::Result<String> {
        // TODO: read clipboard contents
        todo!("ClipboardConnector::read not yet implemented")
    }

    pub fn write(&self, _content: &str) -> anyhow::Result<()> {
        // TODO: write to clipboard
        todo!("ClipboardConnector::write not yet implemented")
    }
}
