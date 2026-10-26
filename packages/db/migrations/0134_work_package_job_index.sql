-- 0134 An index for a job's work packages (TSK-0105; HH-NFR-01). Measured on the synthetic dataset of 10,000 jobs
-- (docs/perf/README.md): the job packet, its loadout pins and its SOP pins read work.work_packages by job_id, which no
-- index covered (the job_id foreign key of 0044 has none), so each read scanned every package. My job packets brings
-- each of the worker's assigned jobs up to date, three such reads per job, and these scans were the three most
-- expensive statements of the staff read load. Work packages without a job (requests not yet approved) never match a
-- job, so the index leaves them out.
CREATE INDEX work_packages_job ON work.work_packages (job_id) WHERE job_id IS NOT NULL;
