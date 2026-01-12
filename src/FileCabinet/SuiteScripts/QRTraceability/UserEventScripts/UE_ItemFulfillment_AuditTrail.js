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
                if (context.type === context.UserEventType.DELETE) {
                    return;
                }

                var fulfillmentRecord = context.newRecord;
                var fulfillmentId = fulfillmentRecord.id;

                log.audit({
                    title: 'Audit Trail Processing Started',
                    details: 'Fulfillment ID: ' + fulfillmentId
                });

                // Get scanned completion references
                var completionRefs = fulfillmentRecord.getValue({
                    fieldId: 'custbody_wo_completion_ref'
                });

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

                for (var i = 0; i < completionIds.length; i++) {
                    var completionId = completionIds[i];

                    try {
                        // Mark completion as fulfilled
                        markCompletionAsFulfilled(completionId, fulfillmentId);

                        // Create audit log entry (if custom record exists)
                        createAuditLogEntry(completionId, fulfillmentId, fulfillmentRecord);

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

        /**
         * Create audit log entry (if custom record exists)
         *
         * @param {string} completionId - Completion internal ID
         * @param {string} fulfillmentId - Fulfillment internal ID
         * @param {record.Record} fulfillmentRecord - Fulfillment record
         */
        function createAuditLogEntry(completionId, fulfillmentId, fulfillmentRecord) {
            try {
                // Get completion details for audit log
                var completionData = getCompletionData(completionId);

                // Create audit log record
                // Note: Comment out if custom record is not created
                var auditLog = record.create({
                    type: 'customrecord_qr_scan_log',
                    isDynamic: false
                });

                auditLog.setValue({
                    fieldId: 'custrecord_scan_completion',
                    value: completionId
                });

                auditLog.setValue({
                    fieldId: 'custrecord_scan_fulfillment',
                    value: fulfillmentId
                });

                auditLog.setValue({
                    fieldId: 'custrecord_scan_datetime',
                    value: new Date()
                });

                auditLog.setValue({
                    fieldId: 'custrecord_scan_user',
                    value: runtime.getCurrentUser().id
                });

                if (completionData) {
                    auditLog.setValue({
                        fieldId: 'custrecord_scan_item',
                        value: completionData.itemId
                    });

                    auditLog.setValue({
                        fieldId: 'custrecord_scan_qty',
                        value: completionData.quantity
                    });

                    auditLog.setValue({
                        fieldId: 'custrecord_scan_lot',
                        value: completionData.lotNumber || ''
                    });
                }

                var logId = auditLog.save();

                log.debug({
                    title: 'Audit Log Created',
                    details: 'Log ID: ' + logId + ' | Completion: ' + completionId + ' | Fulfillment: ' + fulfillmentId
                });

            } catch (e) {
                // Don't fail if custom record doesn't exist
                log.debug({
                    title: 'Audit Log Not Created',
                    details: 'Custom record may not exist. Error: ' + e.message
                });
            }
        }

        /**
         * Get completion data for audit log
         *
         * @param {string} completionId - Completion internal ID
         * @returns {Object|null} Completion data
         */
        function getCompletionData(completionId) {
            try {
                var completionSearch = search.create({
                    type: 'workordercompletion',
                    filters: [
                        ['internalid', 'is', completionId],
                        'AND',
                        ['mainline', 'is', 'T']
                    ],
                    columns: [
                        'item',
                        'quantity',
                        'custbody_qr_payload'
                    ]
                });

                var completionData = null;

                completionSearch.run().each(function (result) {
                    var qrPayload = result.getValue({ name: 'custbody_qr_payload' });
                    var lotNumber = '';

                    // Try to extract lot from QR payload
                    if (qrPayload) {
                        try {
                            var payload = JSON.parse(qrPayload);
                            if (payload.lots && payload.lots.length > 0) {
                                lotNumber = payload.lots[0].num;
                            } else if (payload.serials && payload.serials.length > 0) {
                                lotNumber = payload.serials.map(function (s) { return s.num; }).join(', ');
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }

                    completionData = {
                        itemId: result.getValue({ name: 'item' }),
                        quantity: parseFloat(result.getValue({ name: 'quantity' }) || 0),
                        lotNumber: lotNumber
                    };

                    return false;
                });

                return completionData;

            } catch (e) {
                log.error('Error Getting Completion Data', e.message);
                return null;
            }
        }

        /**
         * Before Submit event handler
         * Optional: Add validation before save
         *
         * @param {Object} context
         */
        function beforeSubmit(context) {
            // Reserved for future validation logic
            // Example: Verify all scanned completions are valid

            // if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.EDIT) return;

            // var rec = context.newRecord;  // or context.oldRecord + load if needed

            // var itemCount = rec.getLineCount({ sublistId: 'item' });
            // log.debug('Item lines', itemCount);

            // for (var i = 0; i < itemCount; i++) {
            //     // Optional: only process specific lines
            //     // if (someCondition) continue;

            //     var invDetail = rec.getSublistSubrecord({
            //         sublistId: 'item',
            //         fieldId: 'inventorydetail',
            //         line: i
            //     });

            //     if (!invDetail) {
            //         // If no subrecord exists yet, create it (dynamic mode usually works server-side)
            //         invDetail = rec.getSublistSubrecord({
            //             sublistId: 'item',
            //             fieldId: 'inventorydetail',
            //             line: i
            //         });
            //         // In many cases NetSuite auto-creates it when needed
            //     }

            //     // Clear existing lines if needed (careful!)
            //     // var assignCount = invDetail.getLineCount({ sublistId: 'inventoryassignment' });
            //     // for (var j = assignCount - 1; j >= 0; j--) {
            //     //     invDetail.removeLine({ sublistId: 'inventoryassignment', line: j });
            //     // }

            //     invDetail.selectNewLine({ sublistId: 'inventoryassignment' });
            //     invDetail.setCurrentSublistValue({
            //         sublistId: 'inventoryassignment',
            //         fieldId: 'issueinventorynumber',
            //         value: '4144'  // ← your inventory number internal id
            //     });
            //     invDetail.setCurrentSublistValue({
            //         sublistId: 'inventoryassignment',
            //         fieldId: 'binnumber',
            //         value: '1'     // ← internal id or string if text-based
            //     });
            //     invDetail.setCurrentSublistValue({
            //         sublistId: 'inventoryassignment',
            //         fieldId: 'inventorystatus',
            //         value: '1'
            //     });
            //     invDetail.setCurrentSublistValue({
            //         sublistId: 'inventoryassignment',
            //         fieldId: 'quantity',
            //         value: 1
            //     });
            //     invDetail.commitLine({ sublistId: 'inventoryassignment' });

            //     rec.commitLine({
            //         sublistId: 'item'
            //     });
            // }

        }

        return {
            afterSubmit: afterSubmit,
            beforeSubmit: beforeSubmit  // Uncomment if needed
        };
    });
