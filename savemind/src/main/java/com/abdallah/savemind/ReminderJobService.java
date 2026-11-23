package com.abdallah.savemind;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Fires one deadline reminder. */
public class ReminderJobService extends JobService {

    @Override
    public boolean onStartJob(final JobParameters params) {
        final long linkId = params.getExtras().getLong("linkId", -1);
        Analyzer.runAsync(new Runnable() {
            @Override
            public void run() {
                try {
                    if (linkId > 0) Reminders.fire(ReminderJobService.this, linkId);
                } finally {
                    jobFinished(params, false);
                }
            }
        });
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
