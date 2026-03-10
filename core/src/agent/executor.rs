pub struct Executor;

impl Executor {
    pub fn new() -> Self {
        Self
    }

    pub async fn execute(&self, _steps: Vec<String>) -> anyhow::Result<String> {
        // TODO: execute a sequence of planned steps
        todo!("Executor::execute not yet implemented")
    }
}
