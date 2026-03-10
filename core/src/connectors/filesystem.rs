use std::path::Path;

pub struct FilesystemConnector;

impl FilesystemConnector {
    pub fn new() -> Self {
        Self
    }

    pub fn list_dir(&self, _path: &Path) -> anyhow::Result<Vec<String>> {
        // TODO: list directory contents
        todo!("FilesystemConnector::list_dir not yet implemented")
    }

    pub fn read_file(&self, _path: &Path) -> anyhow::Result<String> {
        // TODO: read file contents
        todo!("FilesystemConnector::read_file not yet implemented")
    }
}
