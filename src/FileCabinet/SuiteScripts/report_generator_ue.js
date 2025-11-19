/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/log'], function (record, log) {

    function beforeLoad(context) {
        try {
            const form = context.form;

            form.addButton({
                id: 'custpage_generate_report',
                label: 'Generate Report',
                functionName: 'generateReport'
            });

            form.clientScriptModulePath = 'SuiteScripts/report_generator_client.js';
        } catch (e) {
            log.error('Error in beforeLoad', e.message);
        }
    }

    return {
        beforeLoad
    };
});
