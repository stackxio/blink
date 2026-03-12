mod folders;
mod messages;
mod threads;

pub const MIGRATIONS: &[&str] = &[folders::SQL, threads::SQL, messages::SQL];
