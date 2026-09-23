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

CREATE TABLE IF NOT EXISTS kh_document_graph_task (
    id VARCHAR PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    document_id BIGINT NOT NULL,
    document_version INT NOT NULL,
    chunk_id VARCHAR NOT NULL,
    text TEXT NOT NULL,
    dataset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR NOT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    error_message VARCHAR,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kh_graph_task_document
    ON kh_document_graph_task(owner_id, document_id, status);

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

-- 短期记忆：更早轮次的摘要 + 已纳入摘要的消息条数（增量压缩游标）
ALTER TABLE kh_conversation ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE kh_conversation ADD COLUMN IF NOT EXISTS summarized_message_count INT NOT NULL DEFAULT 0;

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

-- 长期记忆：关于用户的稳定事实与偏好，与资料检索严格分离
-- pgvector 扩展由镜像自带，只需启用；向量维度固定 1024，须与 EMBEDDING_DIMENSIONS 一致
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS kh_user_memory (
    id VARCHAR PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    kind VARCHAR NOT NULL,
    source_conversation_id VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'ACTIVE',
    embedding vector(1024),
    hit_count INT NOT NULL DEFAULT 0,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kh_user_memory_owner
    ON kh_user_memory(owner_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_kh_user_memory_embedding
    ON kh_user_memory USING hnsw (embedding vector_cosine_ops);
