#!/usr/bin/env node

/**
 * temporal-n8n CLI Entry Point
 *
 * Command-line interface for running n8n workflows with Temporal.
 * Provides commands for starting workers and executing workflows.
 *
 * Usage:
 *   temporal-n8n worker start --config ./config.json
 *   temporal-n8n workflow run --workflow ./workflow.json
 *   temporal-n8n workflow start --workflow ./workflow.json
 *   temporal-n8n workflow status --workflow-id <id>
 *   temporal-n8n workflow result --workflow-id <id>
 */

const oclif = require('@oclif/core');

oclif.execute({ dir: __dirname }).then(oclif.flush).catch(oclif.Errors.handle);
