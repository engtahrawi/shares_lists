package com.abdallah.savemind;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Periodic background sync (about every 15 minutes, when online). */
public class SyncJobService extends JobService {

    @Override
    public boolean onStartJob(final JobParameters params) {
        Sync.runAsync(this, new Runnable() {
            @Override
            public void run() {
                jobFinished(params, false);
            }
        });
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
