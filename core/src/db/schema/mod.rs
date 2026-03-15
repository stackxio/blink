mod attachments;
mod folders;
mod messages;
mod project_memories;
mod threads;

pub const MIGRATIONS: &[&str] = &[
    folders::SQL,
    threads::SQL,
    messages::SQL,
    project_memories::SQL,
    attachments::SQL,
];
