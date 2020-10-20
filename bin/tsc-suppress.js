#!/usr/bin/env node

const tsc = require('../dist/index');
tsc().catch(console.error);
