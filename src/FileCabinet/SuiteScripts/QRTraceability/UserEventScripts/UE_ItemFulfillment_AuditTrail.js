/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Script: UE_ItemFulfillment_AuditTrail.js
 * Description: Creates audit trail and marks completions as fulfilled
 *
 * Deployment:
 *   - Record Type: Item Fulfillment
 *   - Event: After Submit
 *   - Execution Context: CREATE, EDIT
 *
 * Actions:
 *   1. Read scanned completion IDs from custbody_wo_completion_ref
 *   2. Mark each completion as fulfilled (custbody_qr_scanned = true)
 *   3. Link completion to fulfillment (custbody_qr_linked_fulfillment)
 *   4. Create audit log records (if custom record exists)
 */

define(['N/record', 'N/search', 'N/log', 'N/runtime'],
    function (record, search, log, runtime) {

        /**
         * After Submit event handler
         * Process scanned completions and create audit trail
         *
         * @param {Object} context
         * @param {record.Record} context.newRecord - New record object
         * @param {string} context.type - Trigger type (create, edit, delete)
         */
        function afterSubmit(context) {
            try {
                // Only process on CREATE and EDIT
                if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.EDIT) return;

                const fulfillmentRecord = context.newRecord;
                const fulfillmentId = fulfillmentRecord.id;

                log.audit({
                    title: 'Audit Trail Processing Started',
                    details: 'Fulfillment ID: ' + fulfillmentId
                });

                // Get scanned completion references
                const completionRefs = fulfillmentRecord.getValue({ fieldId: 'custbody_wo_completion_ref' });

                if (!completionRefs) {
                    log.debug('No Scanned Completions', 'No QR scans found for this fulfillment');
                    return;
                }

                // Parse completion IDs
                var completionIds = parseCompletionRefs(completionRefs);
                if (completionIds.length === 0) {
                    log.debug('No Completion IDs', 'No valid completion IDs found');
                    return;
                }

                log.audit({
                    title: 'Processing Completions',
                    details: 'Found ' + completionIds.length + ' completion(s): ' + completionIds.join(', ')
                });

                // Process each completion
                var processedCount = 0;
                var errorCount = 0;

                for (let i = 0; i < completionIds.length; i++) {
                    let completionId = completionIds[i];

                    try {
                        // Mark completion as fulfilled
                        markCompletionAsFulfilled(completionId, fulfillmentId);

                        processedCount++;

                    } catch (e) {
                        errorCount++;
                        log.error({
                            title: 'Error Processing Completion',
                            details: 'Completion ID: ' + completionId + ' | Error: ' + e.message
                        });
                    }
                }

                log.audit({
                    title: 'Audit Trail Complete',
                    details: 'Processed: ' + processedCount + ' | Errors: ' + errorCount
                });

            } catch (e) {
                log.error({
                    title: 'Error in Audit Trail Processing',
                    details: 'Error: ' + e.message + ' | Stack: ' + e.stack
                });
            }
        }

        /**
         * Parse completion references from JSON or comma-separated string
         *
         * @param {string} completionRefs - Completion references
         * @returns {Array} Array of completion IDs
         */
        function parseCompletionRefs(completionRefs) {
            var completionIds = [];

            try {
                // Try parsing as JSON array
                var parsed = JSON.parse(completionRefs);
                if (Array.isArray(parsed)) {
                    completionIds = parsed;
                } else {
                    completionIds = [parsed];
                }
            } catch (e) {
                // If not JSON, try comma-separated
                completionIds = completionRefs.split(',').map(function (id) {
                    return id.trim();
                }).filter(function (id) {
                    return id !== '';
                });
            }

            // Filter out invalid IDs
            completionIds = completionIds.filter(function (id) {
                return id && !isNaN(id);
            });

            return completionIds;
        }

        /**
         * Mark work order completion as fulfilled
         *
         * @param {string} completionId - Completion internal ID
         * @param {string} fulfillmentId - Fulfillment internal ID
         */
        function markCompletionAsFulfilled(completionId, fulfillmentId) {
            try {
                // Check if already marked
                var currentStatus = getCompletionStatus(completionId);
                if (currentStatus.isScanned) {
                    log.debug({
                        title: 'Already Marked',
                        details: 'Completion ' + completionId + ' is already marked as fulfilled'
                    });
                    return;
                }

                // Update completion record
                record.submitFields({
                    type: 'workordercompletion',
                    id: completionId,
                    values: {
                        custbody_qr_scanned: true,
                        custbody_qr_linked_fulfillment: fulfillmentId
                    },
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    }
                });

                log.debug({
                    title: 'Completion Marked as Fulfilled',
                    details: 'Completion ID: ' + completionId + ' | Fulfillment ID: ' + fulfillmentId
                });

            } catch (e) {
                log.error({
                    title: 'Error Marking Completion',
                    details: 'Completion ID: ' + completionId + ' | Error: ' + e.message
                });
                throw e;
            }
        }

        /**
         * Get current completion status
         *
         * @param {string} completionId - Completion internal ID
         * @returns {Object} { isScanned: boolean, fulfillmentId: string }
         */
        function getCompletionStatus(completionId) {
            try {
                var completionSearch = search.create({
                    type: 'workordercompletion',
                    filters: [
                        ['internalid', 'is', completionId],
                        'AND',
                        ['mainline', 'is', 'T']
                    ],
                    columns: [
                        'custbody_qr_scanned',
                        'custbody_qr_linked_fulfillment'
                    ]
                });

                var isScanned = false;
                var fulfillmentId = '';

                completionSearch.run().each(function (result) {
                    isScanned = result.getValue({ name: 'custbody_qr_scanned' }) === 'T';
                    fulfillmentId = result.getValue({ name: 'custbody_qr_linked_fulfillment' }) || '';
                    return false;
                });

                return {
                    isScanned: isScanned,
                    fulfillmentId: fulfillmentId
                };

            } catch (e) {
                log.error('Error Getting Completion Status', e.message);
                return {
                    isScanned: false,
                    fulfillmentId: ''
                };
            }
        }


        return {
            afterSubmit
        };
    });
