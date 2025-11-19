/**
 * Delete all files from a specific File Cabinet folder
 *
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/search', 'N/file', 'N/runtime', 'N/task'], function (search, file, runtime, task) {

    /**
     * Entry point for scheduled script
     * @param {Object} context
     */
    function execute(context) {
        var script = runtime.getCurrentScript();

        // Script parameter: internal ID of the folder (e.g. "Email Reports")
        var folderId = script.getParameter({ name: 'custscript_folder_internal_id' });

        if (!folderId) {
            log.error({
                title: 'Missing folder parameter',
                details: 'Script parameter custscript_email_report_folder is not set.'
            });
            return;
        }

        log.audit({
            title: 'Start cleanup',
            details: 'Deleting files from folder ID: ' + folderId
        });

        var fileSearch = search.create({
            type: 'file',
            filters: [
                ['folder', 'anyof', folderId]
            ],
            columns: [
                search.createColumn({ name: 'internalid', sort: search.Sort.ASC })
            ]
        });

        var hasMore = false;

        fileSearch.run().each(function (result) {
            var remainingUsage = runtime.getCurrentScript().getRemainingUsage();

            // If governance is low, reschedule and stop processing
            if (remainingUsage < 100) {
                hasMore = true;
                log.audit({
                    title: 'Low governance – rescheduling',
                    details: 'Remaining usage: ' + remainingUsage
                });
                rescheduleSelf(folderId);
                return false; // stop .each()
            }

            var fileId = result.getValue({ name: 'internalid' });

            try {
                file.delete({ id: fileId });
                log.audit({
                    title: 'File deleted',
                    details: 'File ID: ' + fileId
                });
            } catch (e) {
                log.error({
                    title: 'Error deleting file ' + fileId,
                    details: e
                });
            }

            return true; // continue
        });

        if (!hasMore) {
            log.audit({
                title: 'Cleanup complete',
                details: 'All files in folder ' + folderId + ' have been processed.'
            });
        }
    }

    /**
     * Reschedule this scheduled script to continue deleting if governance runs low
     * @param {string|number} folderId
     */
    function rescheduleSelf(folderId) {
        var script = runtime.getCurrentScript();

        try {
            var t = task.create({
                taskType: task.TaskType.SCHEDULED_SCRIPT,
                scriptId: script.id,
                deploymentId: script.deploymentId,
                params: {
                    custscript_email_report_folder: folderId
                }
            });

            var taskId = t.submit();

            log.audit({
                title: 'Script rescheduled',
                details: 'Task ID: ' + taskId
            });
        } catch (e) {
            log.error({
                title: 'Error rescheduling script',
                details: e
            });
        }
    }

    return {
        execute: execute
    };
});
