package com.abdallah.savemind;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Resumes queued analysis when the network is available, even if the app is closed. */
public class AnalysisJobService extends JobService {

    @Override
    public boolean onStartJob(final JobParameters params) {
        Analyzer.drainAsync(this, new Runnable() {
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
