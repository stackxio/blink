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
import { docker_info, def as docker_info_def } from "./tools/docker_info";
import { cron_parse, def as cron_parse_def } from "./tools/cron_parse";
import { lint_imports, def as lint_imports_def } from "./tools/lint_imports";
import { find_large_files, def as find_large_files_def } from "./tools/find_large_files";
import { git_rebase, def as git_rebase_def } from "./tools/git_rebase";
import { network_info, def as network_info_def } from "./tools/network_info";
import { list_processes, def as list_processes_def } from "./tools/list_processes";
import { color_convert, def as color_convert_def } from "./tools/color_convert";
import { markdown_lint, def as markdown_lint_def } from "./tools/markdown_lint";
import { system_info, def as system_info_def } from "./tools/system_info";
import { extract_strings, def as extract_strings_def } from "./tools/extract_strings";
import { git_author_stats, def as git_author_stats_def } from "./tools/git_author_stats";
import { json_to_schema, def as json_to_schema_def } from "./tools/json_to_schema";
import { git_pr_info, def as git_pr_info_def } from "./tools/git_pr_info";
import { patch_apply, def as patch_apply_def } from "./tools/patch_apply";
import { make_release_notes, def as make_release_notes_def } from "./tools/make_release_notes";
import { test_coverage, def as test_coverage_def } from "./tools/test_coverage";
import { git_clean, def as git_clean_def } from "./tools/git_clean";
import { template_render, def as template_render_def } from "./tools/template_render";
import { dependency_graph, def as dependency_graph_def } from "./tools/dependency_graph";
import { lint_typescript, def as lint_typescript_def } from "./tools/lint_typescript";
import { prettier_check, def as prettier_check_def } from "./tools/prettier_check";
import { git_show, def as git_show_def } from "./tools/git_show";
import { regex_replace, def as regex_replace_def } from "./tools/regex_replace";
import { bench_command, def as bench_command_def } from "./tools/bench_command";
import { file_stats, def as file_stats_def } from "./tools/file_stats";
import { git_who_changed, def as git_who_changed_def } from "./tools/git_who_changed";
import { url_encode, def as url_encode_def } from "./tools/url_encode";
import { disk_usage, def as disk_usage_def } from "./tools/disk_usage";
import { sql_format, def as sql_format_def } from "./tools/sql_format";
import { yaml_to_json, def as yaml_to_json_def } from "./tools/yaml_to_json";
import { extract_emails, def as extract_emails_def } from "./tools/extract_emails";
import { binary_size, def as binary_size_def } from "./tools/binary_size";
import { list_endpoints, def as list_endpoints_def } from "./tools/list_endpoints";
import { word_count, def as word_count_def } from "./tools/word_count";
import { diff_stats, def as diff_stats_def } from "./tools/diff_stats";
import { check_links, def as check_links_def } from "./tools/check_links";
import { json_path, def as json_path_def } from "./tools/json_path";
import { list_imports, def as list_imports_def } from "./tools/list_imports";
import { repo_overview, def as repo_overview_def } from "./tools/repo_overview";
import { csv_to_json, def as csv_to_json_def } from "./tools/csv_to_json";
import { tree_directory, def as tree_directory_def } from "./tools/tree_directory";
import { escape_string, def as escape_string_def } from "./tools/escape_string";
import { regex_explain, def as regex_explain_def } from "./tools/regex_explain";
import { count_loc, def as count_loc_def } from "./tools/count_loc";
import { lorem_ipsum, def as lorem_ipsum_def } from "./tools/lorem_ipsum";
import { password_strength, def as password_strength_def } from "./tools/password_strength";
import { git_recent_files, def as git_recent_files_def } from "./tools/git_recent_files";
import { convert_indent, def as convert_indent_def } from "./tools/convert_indent";
import { extract_archive, def as extract_archive_def } from "./tools/extract_archive";
import { dns_lookup, def as dns_lookup_def } from "./tools/dns_lookup";
import { file_diff, def as file_diff_def } from "./tools/file_diff";
import { quote_strip, def as quote_strip_def } from "./tools/quote_strip";
import { curl_to_fetch, def as curl_to_fetch_def } from "./tools/curl_to_fetch";
import { sort_lines, def as sort_lines_def } from "./tools/sort_lines";
import { case_convert, def as case_convert_def } from "./tools/case_convert";
import { find_secrets, def as find_secrets_def } from "./tools/find_secrets";
import { timezone_convert, def as timezone_convert_def } from "./tools/timezone_convert";
import { git_unmerged, def as git_unmerged_def } from "./tools/git_unmerged";
import { markdown_to_html, def as markdown_to_html_def } from "./tools/markdown_to_html";

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
    tool(docker_info_def, docker_info),
    tool(cron_parse_def, cron_parse),
    tool(lint_imports_def, lint_imports),
    tool(find_large_files_def, find_large_files),
    tool(git_rebase_def, git_rebase),
    tool(network_info_def, network_info),
    tool(list_processes_def, list_processes),
    tool(color_convert_def, color_convert),
    tool(markdown_lint_def, markdown_lint),
    tool(system_info_def, system_info),
    tool(extract_strings_def, extract_strings),
    tool(git_author_stats_def, git_author_stats),
    tool(json_to_schema_def, json_to_schema),
    tool(git_pr_info_def, git_pr_info),
    tool(patch_apply_def, patch_apply),
    tool(make_release_notes_def, make_release_notes),
    tool(test_coverage_def, test_coverage),
    tool(git_clean_def, git_clean),
    tool(template_render_def, template_render),
    tool(dependency_graph_def, dependency_graph),
    tool(lint_typescript_def, lint_typescript),
    tool(prettier_check_def, prettier_check),
    tool(git_show_def, git_show),
    tool(regex_replace_def, regex_replace),
    tool(bench_command_def, bench_command),
    tool(file_stats_def, file_stats),
    tool(git_who_changed_def, git_who_changed),
    tool(url_encode_def, url_encode),
    tool(disk_usage_def, disk_usage),
    tool(sql_format_def, sql_format),
    tool(yaml_to_json_def, yaml_to_json),
    tool(extract_emails_def, extract_emails),
    tool(binary_size_def, binary_size),
    tool(list_endpoints_def, list_endpoints),
    tool(word_count_def, word_count),
    tool(diff_stats_def, diff_stats),
    tool(check_links_def, check_links),
    tool(json_path_def, json_path),
    tool(list_imports_def, list_imports),
    tool(repo_overview_def, repo_overview),
    tool(csv_to_json_def, csv_to_json),
    tool(tree_directory_def, tree_directory),
    tool(escape_string_def, escape_string),
    tool(regex_explain_def, regex_explain),
    tool(count_loc_def, count_loc),
    tool(lorem_ipsum_def, lorem_ipsum),
    tool(password_strength_def, password_strength),
    tool(git_recent_files_def, git_recent_files),
    tool(convert_indent_def, convert_indent),
    tool(extract_archive_def, extract_archive),
    tool(dns_lookup_def, dns_lookup),
    tool(file_diff_def, file_diff),
    tool(quote_strip_def, quote_strip),
    tool(curl_to_fetch_def, curl_to_fetch),
    tool(sort_lines_def, sort_lines),
    tool(case_convert_def, case_convert),
    tool(find_secrets_def, find_secrets),
    tool(timezone_convert_def, timezone_convert),
    tool(git_unmerged_def, git_unmerged),
    tool(markdown_to_html_def, markdown_to_html),
  ];
}
