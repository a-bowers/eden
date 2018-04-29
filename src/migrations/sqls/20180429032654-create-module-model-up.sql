CREATE TYPE modules_status as ENUM(
    'provisioning',
    'provisioned',
    'provision_failed'
);

CREATE TABLE modules (
    id                      BIGSERIAL PRIMARY KEY,
    wtName                  VARCHAR(255) NOT NULL,
    clientId                VARCHAR(255) NOT NULL,
    modules_status          NOT NULL,
    dependencyFile          TEXT NOT NULL,
    dependencyFileHash      VARCHAR(255) NOT NULL
    lang                    VARCHAR(255) NOT NULL
);

CREATE TABLE modules_jobs(
    id BIGSERIAL PRIMARY KEY,
    job_id BIGSERIAL FOREIGN KEY pg_queue_simple_jobs(id) ON DELETE CASCADE,
    module_id BIGSERIAL FOREIGN KEY REFERENCES modules(id)  ON DELETE CASCADE
);


