CREATE TYPE modules_status as ENUM(
    'provisioning',
    'provisioned',
    'provision_failed'
);

CREATE TABLE modules (
    id                      BIGSERIAL PRIMARY KEY,
    wt_name                 VARCHAR(255) NOT NULL,
    client_id               VARCHAR(255) NOT NULL,
    modules_status          NOT NULL DEFAULT 'provisioning',
    dependency_file_hash    VARCHAR(255) NOT NULL DEFAULT '0000000000'
);

CREATE TABLE modules_jobs(
    id          BIGSERIAL PRIMARY KEY,
    module_id   BIGSERIAL FOREIGN KEY REFERENCES modules(id) ON DELETE CASCADE
    job_id      BIGSERIAL FOREIGN KEY REFERENCES job(id) ON DELETE CASCADE
);
