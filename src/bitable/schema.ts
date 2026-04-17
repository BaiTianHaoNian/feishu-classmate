/**
 * Bitable schema for feishu-classmate.
 *
 * Field type numbers come from Feishu Bitable docs:
 *   1 Text, 2 Number, 3 SingleSelect, 4 MultiSelect, 5 DateTime,
 *   7 Checkbox, 11 User, 15 Url, 17 Attachment, 18 Link (to other table).
 *
 * Keep field names in Chinese to match the PDF spec; field names are what
 * tool callers pass as payload keys.
 */

export interface FieldDef {
  field_name: string;
  type: number;
  property?: Record<string, unknown>;
}

export interface TableDef {
  key: string; // internal key to look up in tableIds config
  name: string;
  fields: FieldDef[];
}

const VISIBILITY_OPTIONS = [
  { name: '可公开', color: 0 },
  { name: '保密', color: 1 },
];

const PROJECT_STATUS_OPTIONS = [
  { name: '规划中', color: 0 },
  { name: '进行中', color: 2 },
  { name: '完成', color: 4 },
  { name: '搁置', color: 7 },
];

const GANTT_STATUS_OPTIONS = [
  { name: '未开始', color: 0 },
  { name: '进行中', color: 2 },
  { name: '完成', color: 4 },
  { name: '逾期', color: 1 },
];

const EQUIPMENT_STATE_OPTIONS = [
  { name: '在库', color: 4 },
  { name: '借出', color: 2 },
  { name: '维修', color: 0 },
  { name: '丢失', color: 1 },
];

const SUBMISSION_STATUS_OPTIONS = [
  { name: '准备中', color: 0 },
  { name: '已投', color: 2 },
  { name: '审稿中', color: 3 },
  { name: 'major revision', color: 7 },
  { name: 'minor revision', color: 5 },
  { name: '已接收', color: 4 },
  { name: '被拒', color: 1 },
  { name: '已撤回', color: 6 },
];

const PAPER_READ_STATUS_OPTIONS = [
  { name: '待读', color: 0 },
  { name: '在读', color: 2 },
  { name: '已读', color: 4 },
  { name: '引用', color: 5 },
];

const EXPERIMENT_STATUS_OPTIONS = [
  { name: '进行中', color: 2 },
  { name: '成功', color: 4 },
  { name: '失败', color: 1 },
  { name: '中断', color: 7 },
];

const RESERVATION_STATUS_OPTIONS = [
  { name: 'pending', color: 0 },
  { name: 'confirmed', color: 2 },
  { name: 'active', color: 3 },
  { name: 'completed', color: 4 },
  { name: 'cancelled', color: 1 },
];

export const PROJECTS_TABLE: TableDef = {
  key: 'projects',
  name: 'Projects',
  fields: [
    { field_name: 'project_id', type: 1 }, // Text primary
    { field_name: 'title', type: 1 },
    { field_name: 'owner_open_id', type: 11 },
    {
      field_name: 'keywords',
      type: 4,
      property: { options: [] }, // populated at runtime as projects add keywords
    },
    {
      field_name: 'visibility',
      type: 3,
      property: { options: VISIBILITY_OPTIONS },
    },
    { field_name: 'abstract_doc_token', type: 15 }, // URL
    {
      field_name: 'status',
      type: 3,
      property: { options: PROJECT_STATUS_OPTIONS },
    },
    { field_name: 'created_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
    { field_name: 'updated_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
  ],
};

export const GANTT_TABLE: TableDef = {
  key: 'gantt',
  name: 'Gantt',
  fields: [
    { field_name: 'gantt_id', type: 1 },
    { field_name: 'project_id', type: 1 }, // not using Link to keep setup simple; FK by string
    { field_name: 'owner_open_id', type: 11 },
    { field_name: 'milestone', type: 1 },
    { field_name: 'due_date', type: 5, property: { date_formatter: 'yyyy-MM-dd' } },
    {
      field_name: 'progress',
      type: 2,
      property: { formatter: '0' },
    },
    {
      field_name: 'status',
      type: 3,
      property: { options: GANTT_STATUS_OPTIONS },
    },
    { field_name: 'notes', type: 1 },
  ],
};

export const EQUIPMENT_TABLE: TableDef = {
  key: 'equipment',
  name: 'Equipment',
  fields: [
    { field_name: 'equipment_id', type: 1 },
    { field_name: 'name', type: 1 },
    { field_name: 'location', type: 1 },
    {
      field_name: 'state',
      type: 3,
      property: { options: EQUIPMENT_STATE_OPTIONS },
    },
    { field_name: 'borrower_open_id', type: 11 },
    { field_name: 'borrow_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
    { field_name: 'expected_return', type: 5, property: { date_formatter: 'yyyy-MM-dd' } },
    { field_name: 'last_seen_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
    { field_name: 'notes', type: 1 },
  ],
};

export const RESEARCH_TABLE: TableDef = {
  key: 'research',
  name: 'Research',
  fields: [
    { field_name: 'report_id', type: 1 },
    { field_name: 'week', type: 1 }, // e.g. "2026-W16"
    { field_name: 'topic', type: 1 },
    { field_name: 'related_works', type: 1 }, // markdown blob
    { field_name: 'insights', type: 1 },
    { field_name: 'source_projects', type: 1 }, // comma-separated project_ids
    { field_name: 'created_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
  ],
};

export const WEEKLY_DIGESTS_TABLE: TableDef = {
  key: 'weekly_digests',
  name: 'WeeklyDigests',
  fields: [
    { field_name: 'digest_id', type: 1 },
    { field_name: 'week', type: 1 }, // e.g. "2026-W16"
    { field_name: 'doc_token', type: 15 }, // URL to generated doc
    { field_name: 'summary_md', type: 1 }, // markdown blob
    { field_name: 'completed_milestones', type: 2, property: { formatter: '0' } },
    { field_name: 'active_projects', type: 2, property: { formatter: '0' } },
    { field_name: 'published_papers', type: 2, property: { formatter: '0' } },
    { field_name: 'created_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
  ],
};

export const SUBMISSIONS_TABLE: TableDef = {
  key: 'submissions',
  name: 'Submissions',
  fields: [
    { field_name: 'submission_id', type: 1 },
    { field_name: 'paper_id', type: 1 }, // FK by string to Papers table
    { field_name: 'title', type: 1 },
    { field_name: 'venue', type: 1 },
    { field_name: 'author_open_ids', type: 11 }, // User multi
    {
      field_name: 'status',
      type: 3,
      property: { options: SUBMISSION_STATUS_OPTIONS },
    },
    { field_name: 'submitted_at', type: 5, property: { date_formatter: 'yyyy-MM-dd' } },
    { field_name: 'decision_due', type: 5, property: { date_formatter: 'yyyy-MM-dd' } },
    { field_name: 'decision_at', type: 5, property: { date_formatter: 'yyyy-MM-dd' } },
    { field_name: 'notes', type: 1 },
  ],
};

/**
 * Standups — daily standup aggregation.
 *
 * One row per (student, date). Written by the `daily-standup` skill after
 * 09:30 cron-driven broadcast + student replies. Also used for weekly digests
 * to recap progress velocity.
 */
export const STANDUPS_TABLE: TableDef = {
  key: 'standups',
  name: 'Standups',
  fields: [
    { field_name: 'standup_id', type: 1 }, // Text primary, e.g. "su_<ts>_<rand>"
    { field_name: 'date', type: 1 }, // "YYYY-MM-DD" for easy filter/group
    { field_name: 'student_open_id', type: 11 }, // User, [{id:"ou_xxx"}]
    { field_name: 'yesterday', type: 1 }, // yesterday progress summary
    { field_name: 'today', type: 1 }, // today plan
    { field_name: 'blockers', type: 1 }, // blockers, may be empty
    { field_name: 'created_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
  ],
};

/**
 * ToolTrace — Phase 1 of 自我进化 (self-evolution).
 *
 * Every `feishu_classmate_*` tool call is logged here from the `after_tool_call`
 * hook in index.ts. This is the ground-truth telemetry Phase 2 auto-evolve
 * will consume (weekly stats, failing tools, success rate per skill).
 *
 * Writes are best-effort / fire-and-forget; hook in index.ts swallows errors.
 */
export const TOOL_TRACE_TABLE: TableDef = {
  key: 'tool_trace',
  name: 'ToolTrace',
  fields: [
    { field_name: 'trace_id', type: 1 }, // Text primary
    { field_name: 'tool_name', type: 1 },
    { field_name: 'session_key', type: 1 },
    { field_name: 'caller_open_id', type: 11 }, // User
    { field_name: 'params_json', type: 1 }, // JSON-stringified params, may be long
    { field_name: 'ok', type: 7 }, // Checkbox
    { field_name: 'error', type: 1 },
    { field_name: 'duration_ms', type: 2, property: { formatter: '0' } },
    { field_name: 'started_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
  ],
};

/**
 * Papers — curated library of papers read / referenced by the lab.
 *
 * Written by the `manage-papers` skill when a student pastes an arXiv ID / DOI
 * or manually adds a paper. arXiv metadata is pulled via
 * `feishu_classmate_research_search_works`. One row per paper; dedup by
 * `arxiv_id` or `doi`.
 */
export const PAPERS_TABLE: TableDef = {
  key: 'papers',
  name: 'Papers',
  fields: [
    { field_name: 'paper_id', type: 1 }, // Text primary, e.g. "paper_<ts>_<rand>"
    { field_name: 'title', type: 1 },
    { field_name: 'authors', type: 1 }, // comma-separated
    { field_name: 'venue', type: 1 }, // "arXiv" / "NeurIPS 2025" / etc.
    { field_name: 'year', type: 2, property: { formatter: '0' } },
    { field_name: 'doi', type: 15 }, // Url, {link, text}
    { field_name: 'arxiv_id', type: 1 },
    { field_name: 'abstract', type: 1 },
    {
      field_name: 'keywords',
      type: 4,
      property: { options: [] }, // MultiSelect, populated at runtime
    },
    {
      field_name: 'read_status',
      type: 3,
      property: { options: PAPER_READ_STATUS_OPTIONS },
    },
    { field_name: 'notes', type: 1 },
    { field_name: 'shared_by_open_id', type: 11 }, // User
    { field_name: 'added_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
  ],
};

/**
 * Experiments — structured metadata for each lab experiment.
 *
 * Written by the `log-experiment` skill. Detailed write-up lives in a separate
 * Feishu Doc; `doc_url` here points at it. Metrics stored as JSON string so the
 * schema doesn't have to evolve per-experiment.
 */
export const EXPERIMENTS_TABLE: TableDef = {
  key: 'experiments',
  name: 'Experiments',
  fields: [
    { field_name: 'exp_id', type: 1 }, // Text primary, e.g. "exp_<ts>_<rand>"
    { field_name: 'project_id', type: 1 }, // FK by string to Projects.project_id
    { field_name: 'student_open_id', type: 11 }, // User
    { field_name: 'title', type: 1 },
    { field_name: 'hypothesis', type: 1 },
    { field_name: 'setup_md', type: 1 }, // long markdown blob (fallback if doc fails)
    { field_name: 'metrics_json', type: 1 }, // JSON string, flat k/v
    { field_name: 'result_summary', type: 1 },
    {
      field_name: 'status',
      type: 3,
      property: { options: EXPERIMENT_STATUS_OPTIONS },
    },
    { field_name: 'doc_url', type: 15 }, // Url, link to detailed Doc
    { field_name: 'created_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
    { field_name: 'completed_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
  ],
};

/**
 * Reservations — time-slot bookings for shared equipment (GPU / 3D printer /
 * microscope / etc.).
 *
 * Written by the `reserve-equipment` skill. Conflict detection is done by the
 * skill against this same table before write. `status` uses lowercase English
 * enum to stay distinct from Equipment.state's Chinese enum.
 */
export const RESERVATIONS_TABLE: TableDef = {
  key: 'reservations',
  name: 'Reservations',
  fields: [
    { field_name: 'reservation_id', type: 1 }, // Text primary, e.g. "res_<ts>_<rand>"
    { field_name: 'equipment_id', type: 1 }, // FK by string to Equipment.equipment_id
    { field_name: 'requester_open_id', type: 11 }, // User
    { field_name: 'start_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
    { field_name: 'end_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
    { field_name: 'purpose', type: 1 },
    {
      field_name: 'status',
      type: 3,
      property: { options: RESERVATION_STATUS_OPTIONS },
    },
    { field_name: 'created_at', type: 5, property: { date_formatter: 'yyyy-MM-dd HH:mm' } },
  ],
};

export const ALL_TABLES: TableDef[] = [
  PROJECTS_TABLE,
  GANTT_TABLE,
  EQUIPMENT_TABLE,
  RESEARCH_TABLE,
  WEEKLY_DIGESTS_TABLE,
  SUBMISSIONS_TABLE,
  STANDUPS_TABLE,
  TOOL_TRACE_TABLE,
  PAPERS_TABLE,
  EXPERIMENTS_TABLE,
  RESERVATIONS_TABLE,
];
