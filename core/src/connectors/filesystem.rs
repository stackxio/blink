use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct FilesystemEntry {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
    pub size: u64,
}

pub struct FilesystemConnector;

impl FilesystemConnector {
    pub fn new() -> Self {
        Self
    }

    pub fn expand_path(&self, raw: &str) -> PathBuf {
        if raw == "~" {
            return dirs::home_dir().unwrap_or_else(|| PathBuf::from(raw));
        }

        if let Some(stripped) = raw.strip_prefix("~/") {
            if let Some(home) = dirs::home_dir() {
                return home.join(stripped);
            }
        }

        PathBuf::from(raw)
    }

    pub fn list_dir(&self, path: &Path) -> anyhow::Result<Vec<FilesystemEntry>> {
        let path = self.canonicalize_existing(path)?;
        let mut entries = Vec::new();

        for entry in fs::read_dir(&path)? {
            let entry = entry?;
            let metadata = entry.metadata()?;
            entries.push(FilesystemEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry.path(),
                is_dir: metadata.is_dir(),
                size: if metadata.is_file() {
                    metadata.len()
                } else {
                    0
                },
            });
        }

        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        Ok(entries)
    }

    pub fn read_file(&self, path: &Path) -> anyhow::Result<String> {
        let path = self.canonicalize_existing(path)?;
        Ok(fs::read_to_string(path)?)
    }

    pub fn rename_path(&self, path: &Path, new_name: &str) -> anyhow::Result<PathBuf> {
        let path = self.canonicalize_existing(path)?;
        let parent = path
            .parent()
            .ok_or_else(|| anyhow::anyhow!("Path has no parent directory"))?;
        let sanitized_name = sanitize_file_name(new_name);

        if sanitized_name.is_empty() {
            return Err(anyhow::anyhow!("New file name is empty after sanitization"));
        }

        let target = self.unique_path(parent.join(sanitized_name));
        fs::rename(&path, &target)?;
        Ok(target)
    }

    pub fn move_to_dir(&self, path: &Path, target_dir: &Path) -> anyhow::Result<PathBuf> {
        let path = self.canonicalize_existing(path)?;
        let file_name = path
            .file_name()
            .ok_or_else(|| anyhow::anyhow!("Path has no file name"))?;
        fs::create_dir_all(target_dir)?;
        let target = self.unique_path(target_dir.join(file_name));

        match fs::rename(&path, &target) {
            Ok(()) => Ok(target),
            Err(error) if is_cross_device_error(&error) => {
                fs::copy(&path, &target)?;
                fs::remove_file(&path)?;
                Ok(target)
            }
            Err(error) => Err(error.into()),
        }
    }

    fn canonicalize_existing(&self, path: &Path) -> anyhow::Result<PathBuf> {
        if !path.exists() {
            return Err(anyhow::anyhow!("Path does not exist: {}", path.display()));
        }

        Ok(fs::canonicalize(path)?)
    }

    fn unique_path(&self, desired: PathBuf) -> PathBuf {
        if !desired.exists() {
            return desired;
        }

        let parent = desired
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));
        let stem = desired
            .file_stem()
            .and_then(OsStr::to_str)
            .unwrap_or("file");
        let ext = desired.extension().and_then(OsStr::to_str);

        for index in 1..10_000 {
            let candidate_name = match ext {
                Some(ext) if !ext.is_empty() => format!("{stem}-{index}.{ext}"),
                _ => format!("{stem}-{index}"),
            };
            let candidate = parent.join(candidate_name);
            if !candidate.exists() {
                return candidate;
            }
        }

        desired
    }
}

fn sanitize_file_name(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|ch| !matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect::<String>()
        .trim_matches('.')
        .trim()
        .to_string()
}

fn is_cross_device_error(error: &io::Error) -> bool {
    matches!(error.raw_os_error(), Some(18))
}
