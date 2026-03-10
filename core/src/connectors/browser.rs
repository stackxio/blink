pub struct BrowserConnector;

impl BrowserConnector {
    pub fn new() -> Self {
        Self
    }

    pub fn open_url(&self, _url: &str) -> anyhow::Result<()> {
        // TODO: open URL in default browser
        todo!("BrowserConnector::open_url not yet implemented")
    }
}
