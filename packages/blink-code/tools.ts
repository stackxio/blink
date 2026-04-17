import type { ToolDef } from "./panel/tools";

import { read_file, def as read_file_def } from "./tools/read_file";
import { write_file, def as write_file_def } from "./tools/write_file";
import { list_dir, def as list_dir_def } from "./tools/list_dir";
import { run_command, def as run_command_def } from "./tools/run_command";
import { search_files, def as search_files_def } from "./tools/search_files";
import { glob_files, def as glob_files_def } from "./tools/glob_files";
import { edit_file, def as edit_file_def } from "./tools/edit_file";
import { create_dir, def as create_dir_def } from "./tools/create_dir";
import { delete_file, def as delete_file_def } from "./tools/delete_file";
import { move_file, def as move_file_def } from "./tools/move_file";
import { git_status, def as git_status_def } from "./tools/git_status";
import { git_diff, def as git_diff_def } from "./tools/git_diff";
import { git_log, def as git_log_def } from "./tools/git_log";
import { file_tree, def as file_tree_def } from "./tools/file_tree";
import { git_commit, def as git_commit_def } from "./tools/git_commit";
import { find_in_workspace, def as find_in_workspace_def } from "./tools/find_in_workspace";
import { web_search, def as web_search_def, setApiKey } from "./tools/web_search";
import { read_url, def as read_url_def } from "./tools/read_url";
import { http_request, def as http_request_def } from "./tools/http_request";
import { run_tests, def as run_tests_def } from "./tools/run_tests";
import { get_env, def as get_env_def } from "./tools/get_env";
import { diff_files, def as diff_files_def } from "./tools/diff_files";
import { workspace_symbol_search, def as workspace_symbol_search_def } from "./tools/workspace_symbol_search";
import { list_npm_scripts, def as list_npm_scripts_def } from "./tools/list_npm_scripts";
import { get_file_outline, def as get_file_outline_def } from "./tools/get_file_outline";
import { count_tokens, def as count_tokens_def } from "./tools/count_tokens";
import { project_stats, def as project_stats_def } from "./tools/project_stats";
import { find_todos, def as find_todos_def } from "./tools/find_todos";
import { check_port, def as check_port_def } from "./tools/check_port";
import { dependency_check, def as dependency_check_def } from "./tools/dependency_check";
import { get_recent_changes, def as get_recent_changes_def } from "./tools/get_recent_changes";
import { format_file, def as format_file_def } from "./tools/format_file";
import { get_git_remotes, def as get_git_remotes_def } from "./tools/get_git_remotes";
import { file_history, def as file_history_def } from "./tools/file_history";
import { generate_interface, def as generate_interface_def } from "./tools/generate_interface";
import { git_blame, def as git_blame_def } from "./tools/git_blame";
import { read_multiple_files, def as read_multiple_files_def } from "./tools/read_multiple_files";
import { compare_branches, def as compare_branches_def } from "./tools/compare_branches";
import { run_linter, def as run_linter_def } from "./tools/run_linter";
import { install_dependency, def as install_dependency_def } from "./tools/install_dependency";
import { git_branch, def as git_branch_def } from "./tools/git_branch";
import { git_stash, def as git_stash_def } from "./tools/git_stash";
import { regex_test, def as regex_test_def } from "./tools/regex_test";
import { base64, def as base64_def } from "./tools/base64";
import { generate_uuid, def as generate_uuid_def } from "./tools/generate_uuid";
import { json_format, def as json_format_def } from "./tools/json_format";
import { hash, def as hash_def } from "./tools/hash";
import { timestamp, def as timestamp_def } from "./tools/timestamp";
import { url_parse, def as url_parse_def } from "./tools/url_parse";
import { string_transform, def as string_transform_def } from "./tools/string_transform";
import { math_eval, def as math_eval_def } from "./tools/math_eval";
import { search_replace, def as search_replace_def } from "./tools/search_replace";
import { find_duplicates, def as find_duplicates_def } from "./tools/find_duplicates";
import { bulk_rename, def as bulk_rename_def } from "./tools/bulk_rename";
import { get_package_info, def as get_package_info_def } from "./tools/get_package_info";
import { image_info, def as image_info_def } from "./tools/image_info";
import { create_file_template, def as create_file_template_def } from "./tools/create_file_template";
import { git_cherry_pick, def as git_cherry_pick_def } from "./tools/git_cherry_pick";
import { summarize_directory, def as summarize_directory_def } from "./tools/summarize_directory";
import { env_diff, def as env_diff_def } from "./tools/env_diff";
import { check_accessibility, def as check_accessibility_def } from "./tools/check_accessibility";
import { measure_performance, def as measure_performance_def } from "./tools/measure_performance";
import { security_scan, def as security_scan_def } from "./tools/security_scan";
import { jwt_decode, def as jwt_decode_def } from "./tools/jwt_decode";
import { semver, def as semver_def } from "./tools/semver";
import { dead_code, def as dead_code_def } from "./tools/dead_code";
import { api_test, def as api_test_def } from "./tools/api_test";
import { git_tag, def as git_tag_def } from "./tools/git_tag";
import { parse_csv, def as parse_csv_def } from "./tools/parse_csv";
import { diff_json, def as diff_json_def } from "./tools/diff_json";
import { code_metrics, def as code_metrics_def } from "./tools/code_metrics";
import { generate_docs, def as generate_docs_def } from "./tools/generate_docs";

function tool(
  def: Record<string, unknown>,
  fn: (input: Record<string, unknown>) => Promise<string>,
): ToolDef {
  return { ...(def as Omit<ToolDef, "execute">), execute: fn };
}

export function buildTools(config?: { braveSearchApiKey?: string }): ToolDef[] {
  setApiKey(config?.braveSearchApiKey ?? "");

  return [
    tool(read_file_def, read_file),
    tool(write_file_def, write_file),
    tool(list_dir_def, list_dir),
    tool(run_command_def, run_command),
    tool(search_files_def, search_files),
    tool(glob_files_def, glob_files),
    tool(edit_file_def, edit_file),
    tool(create_dir_def, create_dir),
    tool(delete_file_def, delete_file),
    tool(move_file_def, move_file),
    tool(git_status_def, git_status),
    tool(git_diff_def, git_diff),
    tool(git_log_def, git_log),
    tool(file_tree_def, file_tree),
    tool(git_commit_def, git_commit),
    tool(find_in_workspace_def, find_in_workspace),
    tool(web_search_def, web_search),
    tool(read_url_def, read_url),
    tool(http_request_def, http_request),
    tool(run_tests_def, run_tests),
    tool(get_env_def, get_env),
    tool(diff_files_def, diff_files),
    tool(workspace_symbol_search_def, workspace_symbol_search),
    tool(list_npm_scripts_def, list_npm_scripts),
    tool(get_file_outline_def, get_file_outline),
    tool(count_tokens_def, count_tokens),
    tool(project_stats_def, project_stats),
    tool(find_todos_def, find_todos),
    tool(check_port_def, check_port),
    tool(dependency_check_def, dependency_check),
    tool(get_recent_changes_def, get_recent_changes),
    tool(format_file_def, format_file),
    tool(get_git_remotes_def, get_git_remotes),
    tool(file_history_def, file_history),
    tool(generate_interface_def, generate_interface),
    tool(git_blame_def, git_blame),
    tool(read_multiple_files_def, read_multiple_files),
    tool(compare_branches_def, compare_branches),
    tool(run_linter_def, run_linter),
    tool(install_dependency_def, install_dependency),
    tool(git_branch_def, git_branch),
    tool(git_stash_def, git_stash),
    tool(regex_test_def, regex_test),
    tool(base64_def, base64),
    tool(generate_uuid_def, generate_uuid),
    tool(json_format_def, json_format),
    tool(hash_def, hash),
    tool(timestamp_def, timestamp),
    tool(url_parse_def, url_parse),
    tool(string_transform_def, string_transform),
    tool(math_eval_def, math_eval),
    tool(search_replace_def, search_replace),
    tool(find_duplicates_def, find_duplicates),
    tool(bulk_rename_def, bulk_rename),
    tool(get_package_info_def, get_package_info),
    tool(image_info_def, image_info),
    tool(create_file_template_def, create_file_template),
    tool(git_cherry_pick_def, git_cherry_pick),
    tool(summarize_directory_def, summarize_directory),
    tool(env_diff_def, env_diff),
    tool(check_accessibility_def, check_accessibility),
    tool(measure_performance_def, measure_performance),
    tool(security_scan_def, security_scan),
    tool(jwt_decode_def, jwt_decode),
    tool(semver_def, semver),
    tool(dead_code_def, dead_code),
    tool(api_test_def, api_test),
    tool(git_tag_def, git_tag),
    tool(parse_csv_def, parse_csv),
    tool(diff_json_def, diff_json),
    tool(code_metrics_def, code_metrics),
    tool(generate_docs_def, generate_docs),
  ];
}
