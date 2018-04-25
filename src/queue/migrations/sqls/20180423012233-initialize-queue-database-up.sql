CREATE TYPE pg_queue_simple_jobstatus as ENUM('waiting', 'busy', 'crashed', 'failed', 'completed');

CREATE TABLE pg_queue_simple_jobs (
    jobid BIGSERIAL PRIMARY KEY,
    type VARCHAR(128) NOT NULL,
    status pg_queue_simple_jobstatus DEFAULT 'waiting',
    retries_remaining SMALLINT DEFAULT 5,
    metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE FUNCTION pg_queue_simple_notify() RETURNS trigger AS $$
    DECLARE
        BEGIN
            PERFORM pg_notify(
                'pg_queue_simple_trigger_created_' || NEW.type,
                'pg_queue_simple_trigger_created_' || New.type || ',' || NEW.jobid
            );
        RETURN new;
    END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pg_queue_simple_jobtrigger AFTER INSERT ON pg_queue_simple_jobs
    FOR EACH ROW EXECUTE PROCEDURE pg_queue_simple_notify();
