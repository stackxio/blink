Implementation Spec

Goal
Turn Caret from a folder-grouped chat app into a true system-layer AI workspace with:

system-wide default scope
optional per-project or per-chat directory scope
native macOS directory picker when creating a project/chat
explicit disclaimer when no directory is selected
shared project context across chats
file ingestion for PDF, CSV, and other common document types
Product Rules

Default scope is the entire system.
A user can optionally bind a project to a directory.
A chat inherits its project scope by default.
A chat may optionally override the inherited scope.
If no directory is selected, the UI must clearly say: “Target scope: entire system”.
Files uploaded into a project become reusable context across all chats in that project.
“Folder” in the UI should become “Project” unless you intentionally want both concepts.
Core Data Model

Add these schema changes.

projects table

id TEXT PRIMARY KEY
name TEXT NOT NULL
root_path TEXT NULL
scope_mode TEXT NOT NULL CHECK(scope_mode IN ('system','directory')) DEFAULT 'system'
icon TEXT NOT NULL DEFAULT 'Folder'
color TEXT NOT NULL DEFAULT '#6b7280'
shared_context_summary TEXT NULL
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
This can replace folders, or you can migrate folders into projects.

threads table additions

project_id TEXT NULL
root_path_override TEXT NULL
scope_mode_override TEXT NULL CHECK(scope_mode_override IN ('inherit','system','directory')) DEFAULT 'inherit'
title TEXT NOT NULL
provider_thread_id fields as needed
created_at, updated_at, archived_at
messages table additions

keep existing fields
optionally add metadata_json TEXT NULL
attachments table

id TEXT PRIMARY KEY
project_id TEXT NULL
thread_id TEXT NULL
message_id TEXT NULL
original_name TEXT NOT NULL
mime_type TEXT NULL
file_path TEXT NOT NULL
size_bytes INTEGER NOT NULL
extraction_status TEXT NOT NULL CHECK(extraction_status IN ('pending','complete','failed'))
extracted_text_path TEXT NULL
preview_text TEXT NULL
created_at TEXT NOT NULL
project_memories table

id TEXT PRIMARY KEY
project_id TEXT NOT NULL
source_type TEXT NOT NULL CHECK(source_type IN ('thread_summary','attachment_summary','manual_note','system_fact'))
source_id TEXT NULL
content TEXT NOT NULL
priority INTEGER NOT NULL DEFAULT 0
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
Migration Plan

Create new columns on existing folders and threads.
Backfill old folders as scope_mode='system', root_path=NULL.
Keep old APIs working temporarily.
Rename UI labels from “Folder” to “Project”.
Later optionally rename DB tables once stable.
Backend API Spec

Add Tauri commands.

Project management:

create_project(name, scope_mode, root_path?) -> Project
update_project_scope(project_id, scope_mode, root_path?) -> Project
list_projects() -> Project[]
rename_project(project_id, name) -> void
delete_project(project_id) -> void
Chat creation:

create_thread(project_id?, title, scope_mode_override?, root_path_override?) -> Thread
update_thread_scope(thread_id, scope_mode_override, root_path_override?) -> Thread
get_thread_scope(thread_id) -> EffectiveScope
Native directory picker:

pick_directory() -> string | null
Project memory:

list_project_memories(project_id) -> MemoryItem[]
rebuild_project_summary(project_id) -> void
pin_project_memory(project_id, content) -> void
Attachments:

attach_files(thread_id?, project_id?, paths[]) -> Attachment[]
list_attachments(project_id?, thread_id?) -> Attachment[]
extract_attachment_text(attachment_id) -> void
read_attachment_preview(attachment_id) -> AttachmentPreview
Scope resolution:

resolve_effective_scope(thread_id) -> { mode, root_path, label }
Effective Scope Rules

When sending a prompt:

If thread override is directory, use thread.root_path_override.
If thread override is system, use system-wide mode.
If thread override is inherit, use project scope.
If project has no directory, mode is system.
Returned object:

mode: 'system' | 'directory'
root_path: string | null
display_label: 'Entire System' | '/Users/...'
Provider Execution Contract

Every execution-capable provider/tool should receive:

scope_mode
root_path
approval_mode
sandbox_mode
For Codex server flow:

when possible, pass cwd/root to the provider session
if provider cannot enforce cwd directly, prepend strong scoped instructions and enforce path validation at the tool layer
Important:
Do not rely on prompts alone for directory boundaries. Tool execution must validate paths.

Tool Safety Layer

Add a central scope guard.

ScopeGuard

resolves effective scope
validates whether a read/write path is allowed
if system, allow full system
if directory, require target path to stay within selected root
canonicalize paths before checks
reject symlink escapes if needed
All filesystem tools must call ScopeGuard before acting.

UI Spec

Sidebar
Replace “Folders” with “Projects”.

Project row should show:

project name
scope badge:
System
Directory
truncated root path if directory scoped
Context menu:

Open project
New chat in project
Change directory
Switch to system-wide
Rename project
Delete project
New Project Flow
When user clicks new project:

Enter project name
Ask: select directory or use entire system
Open native macOS folder picker if choosing directory
If canceled, create as system-wide project
Show disclaimer in project header
Suggested copy:

No directory selected. This project can operate across the entire system.
New Chat Flow
When user clicks new chat:

if launched inside project, inherit project scope
optional “Change scope” action in chat header/composer
for standalone chats, default to entire system
Chat Header
Show current scope prominently:

Target: Entire System
Target: /Users/mhomsi/personal/code/voxire
If inherited:

Inherited from project
If overridden:

Chat-specific scope
Composer
Add:

attach button
scope badge
maybe project memory indicator
Project View
Add sections:

Name
Scope
Directory path
Shared context
Attachments
Chats
Settings
Add a “Permissions & Scope” page:

default new chat scope
default new project behavior
approval mode
path safety options
Shared Project Context Spec

When building a prompt for a thread, include:

normal system prompt
project summary
pinned project facts
recent relevant thread summaries
selected attachment summaries
Prompt assembly order:

global system prompt
project scope metadata
project shared memory
relevant attachment excerpts
thread history
current user input
Project summary generation:

after every completed assistant response, enqueue summary update
summarize thread delta into project memory
deduplicate similar facts
keep a token budget
Attachment/Ingestion Spec

Phase 1 supported types

.txt
.md
.csv
.pdf
Phase 2

.docx
.xlsx
images with OCR
source code archives
Extraction behavior:

copy or register file path
detect MIME
extract text
store preview and full extracted text
create summary memory entry for project reuse
CSV handling:

preview rows
column names
row count
sample stats later
PDF handling:

page count
extracted text
preview snippet
fallback error if scanned/non-extractable until OCR exists
Prompt Additions

Update default prompts so the agent knows:

default scope may be the full machine
project scope may narrow it
it must mention its current target when relevant
uploaded files are valid context sources
chats in the same project may share memory
Add a runtime prompt block like:

current effective scope
project name
root path if any
attached file summaries
Implementation Phases

Phase 1: Scope Foundation

add DB columns/tables
add pick_directory
add project scope CRUD
add chat effective scope resolution
rename folder UI to project UI
add disclaimer/header badges
Phase 2: Real Scope Enforcement

add ScopeGuard
thread/project-aware filesystem access
wire approval mode and runtime mode to backend
remove fake UI toggles until enforced
Phase 3: Shared Project Context

add project_memories
summarize chats into project memory
include project memory in prompt construction
show project context in UI
Phase 4: Attachments

add attachments schema and commands
attach button in composer
PDF/CSV/text ingestion
attachment summaries in prompt
Phase 5: System Layer Tooling

implement real filesystem/browser/clipboard/shell tools
audit logs for actions
path validation and permission boundaries
richer task execution engine
Non-Functional Requirements

all path operations must canonicalize first
no silent writes outside validated scope
every destructive action should be logged
project memory must be size-limited and summarized
attachment extraction should be async and resilient
Acceptance Criteria

Scope:

creating a project can choose directory or entire system
if directory not chosen, project clearly shows Entire System
new chats inherit project scope
chat can override scope
backend can resolve effective scope for any thread
Shared context:

ask something in chat A, refer to it in chat B in same project, and the system has project-level memory available
Attachments:

user can attach PDF/CSV/txt/md
extracted content is stored and reusable in later chats within the same project
Truthful runtime:

UI access mode matches backend enforcement
no “supervised/full access” mismatch
Recommended First Tickets

Add schema migrations for project scope and thread scope override.
Implement pick_directory Tauri command.
Replace folder UI labels and models with project scope fields.
Add effective scope badge/header in chat and project views.
Add resolve_effective_scope(thread_id).
Add ScopeGuard and wire it into filesystem commands.
Add project_memories and prompt injection.
Add attachments table plus PDF/CSV/text ingestion.