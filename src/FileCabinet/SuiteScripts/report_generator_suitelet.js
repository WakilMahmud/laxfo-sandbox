/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/task', 'N/log'], (task, log) => {
    // Match the Scheduled Script parameter id
    const PARAM_PAYLOAD = 'custscript_customer_statement';
    // const PARAM_PAYLOAD = 'custscript_customer_statement_mr';

    const onRequest = (ctx) => {

        if (ctx.request.method === 'POST') {
            const body = ctx.request.body || '{}';

            const payload = JSON.parse(body);

            const sheduledScript = task.create({
                taskType: task.TaskType.SCHEDULED_SCRIPT,
                scriptId: 'customscript_customer_statement_report_2',
                deploymentId: 'customdeploy_customer_statement_report',
                params: {
                    [PARAM_PAYLOAD]: JSON.stringify(payload)
                }
            });


            const taskId = sheduledScript.submit();

            // const mapReduceScript = task.create({
            //     taskType: task.TaskType.MAP_REDUCE,
            //     scriptId: 'customscript_customer_statement_mr',
            //     deploymentId: 'customdeploy_customer_statement_mr',
            //     params: {
            //         [PARAM_PAYLOAD]: JSON.stringify(payload)
            //     }
            // });

            // const taskId = mapReduceScript.submit();

            ctx.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            ctx.response.write(JSON.stringify({ ok: true, taskId }));
            return;
        }

    };

    return { onRequest };
});
