-- 文档元数据表
CREATE TABLE IF NOT EXISTS kh_document (
    id BIGINT PRIMARY KEY,
    title VARCHAR NOT NULL,
    content_id VARCHAR NOT NULL UNIQUE,
    summary VARCHAR,
    category_id BIGINT,
    team_id BIGINT,
    author_id BIGINT,
    cover_image VARCHAR,
    tags VARCHAR,
    status SMALLINT NOT NULL DEFAULT 0,
    remark VARCHAR,
    view_count INT NOT NULL DEFAULT 0,
    like_count INT NOT NULL DEFAULT 0,
    comment_count INT NOT NULL DEFAULT 0,
    favourite_count INT NOT NULL DEFAULT 0,
    word_count INT NOT NULL DEFAULT 0,
    publish_time TIMESTAMP,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    create_by BIGINT,
    update_by BIGINT,
    deleted BOOLEAN NOT NULL DEFAULT false
);

-- 文档发布审核记录
-- 一次「提交审核」一行；approve/reject 后 review_result 非空，不再出现在待办列表
CREATE TABLE IF NOT EXISTS kh_document_review (
    id BIGINT PRIMARY KEY,                          -- 审核记录 ID（雪花）
    document_id BIGINT NOT NULL,                    -- 被审文档 ID → kh_document.id
    reviewer_id BIGINT,                             -- 审核人 ID；待审时为 NULL
    reviewer_name VARCHAR,                          -- 审核人姓名
    review_result SMALLINT,                         -- NULL=待审 1=通过 2=驳回
    review_comment VARCHAR,                         -- 审核意见（驳回必填）
    before_status SMALLINT NOT NULL,                -- 提审前文档 status（0 草稿 / 1 已发布）
    reviewed_at TIMESTAMP,                          -- 审核完成时间
    created_at TIMESTAMP NOT NULL DEFAULT NOW()     -- 提交审核时间
);
-- 按文档查审核历史
CREATE INDEX IF NOT EXISTS idx_kh_document_review_document_id ON kh_document_review(document_id);
-- 待办列表：仅 review_result IS NULL 的行
CREATE INDEX IF NOT EXISTS idx_kh_document_review_pending ON kh_document_review(review_result) WHERE review_result IS NULL;

-- Personal workspace MVP tables
ALTER TABLE kh_document ADD COLUMN IF NOT EXISTS owner_id BIGINT;
ALTER TABLE kh_document ADD COLUMN IF NOT EXISTS source_file_name VARCHAR;
ALTER TABLE kh_document ADD COLUMN IF NOT EXISTS source_file_key VARCHAR;
ALTER TABLE kh_document ADD COLUMN IF NOT EXISTS source_file_size BIGINT;
ALTER TABLE kh_document ADD COLUMN IF NOT EXISTS source_file_extension VARCHAR;
CREATE INDEX IF NOT EXISTS idx_kh_document_owner_id ON kh_document(owner_id);

CREATE TABLE IF NOT EXISTS kh_dataset (
    id BIGINT PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    name VARCHAR NOT NULL,
    description VARCHAR,
    deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kh_dataset_owner_id ON kh_dataset(owner_id);

CREATE TABLE IF NOT EXISTS kh_dataset_document (
    dataset_id BIGINT NOT NULL,
    document_id BIGINT NOT NULL,
    owner_id BIGINT NOT NULL,
    PRIMARY KEY (dataset_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_kh_dataset_document_owner_id
    ON kh_dataset_document(owner_id);

CREATE TABLE IF NOT EXISTS kh_document_ingestion_job (
    id VARCHAR PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    document_id BIGINT NOT NULL,
    document_version INT NOT NULL DEFAULT 1,
    operation VARCHAR NOT NULL,
    status VARCHAR NOT NULL,
    current_stage VARCHAR,
    retry_count INT NOT NULL DEFAULT 0,
    error_code VARCHAR,
    error_message VARCHAR,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kh_ingestion_job_owner_document
    ON kh_document_ingestion_job(owner_id, document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kh_conversation (
    id VARCHAR PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    title VARCHAR NOT NULL,
    dataset_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kh_conversation_owner_id
    ON kh_conversation(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS kh_chat_message (
    id VARCHAR PRIMARY KEY,
    conversation_id VARCHAR NOT NULL,
    owner_id BIGINT NOT NULL,
    role VARCHAR NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'COMPLETED',
    used_tools_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    model VARCHAR,
    thinking BOOLEAN NOT NULL DEFAULT false,
    confidence REAL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kh_chat_message_conversation
    ON kh_chat_message(owner_id, conversation_id, created_at);

CREATE TABLE IF NOT EXISTS kh_chat_citation (
    id VARCHAR PRIMARY KEY,
    message_id VARCHAR NOT NULL,
    owner_id BIGINT NOT NULL,
    document_id BIGINT NOT NULL,
    chunk_id VARCHAR NOT NULL,
    quote TEXT NOT NULL,
    locator_json JSONB NOT NULL,
    rank INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kh_chat_citation_message
    ON kh_chat_citation(owner_id, message_id, rank);

CREATE TABLE IF NOT EXISTS kh_interview_session (
    id VARCHAR PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    dataset_id BIGINT NOT NULL,
    mode VARCHAR NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'IN_PROGRESS',
    current_index INT NOT NULL DEFAULT 0,
    total_questions INT NOT NULL DEFAULT 5,
    current_question TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kh_interview_session_owner
    ON kh_interview_session(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS kh_interview_turn (
    id VARCHAR PRIMARY KEY,
    session_id VARCHAR NOT NULL,
    owner_id BIGINT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    evaluation_json JSONB NOT NULL,
    citation_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kh_interview_turn_session
    ON kh_interview_turn(owner_id, session_id, created_at);

CREATE TABLE IF NOT EXISTS kh_review_item (
    id VARCHAR PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    source_turn_id VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    reason TEXT,
    status VARCHAR NOT NULL DEFAULT 'PENDING',
    due_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kh_review_item_owner
    ON kh_review_item(owner_id, status, created_at DESC);
