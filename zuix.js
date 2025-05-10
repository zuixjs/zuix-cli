#!/usr/bin/env node

/*
 * Copyright 2020-2025 G-Labs. All Rights Reserved.
 *         https://zuixjs.github.io/zuix
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 *
 *  This file is part of
 *  zUIx, Javascript library for component-based development.
 *        https://zuixjs.github.io/zuix
 *
 * @author Generoso Martello - https://github.com/genemars
 */

const {program, Argument} = require("commander");
const pkg = require("./package.json");
const newProject = require("./commands/new-project");
const { spawn } = require('child_process');
const generate = require("./commands/generate");
const compilePage = require("./commands/compile-page");
const fs = require("fs");
const path = require("path");

program
    .command('version')
    .description('output CLI version')
    .action(() => {
        console.log(`${pkg.name} v${pkg.version}`);
    });

program
    .command('new <project_name>')
    .option('-t <template_name>', 'Starter template', 'zuix-web-starter')
    .description('Creates a new project')
    .action(newProject);

program
    .command('start')
    .description('Starts the development server')
    .action(() => {
        console.log('Starting development server...');
        const args = ['node_modules/@11ty/eleventy/cmd.cjs', '--serve', '--config=.eleventy.mjs'];
        const child = spawn(process.execPath, args, {
            stdio: 'inherit',
            shell: false
        });
        const forwardSignal = (signal) => {
            if (child && !child.killed) {
                try {
                    process.kill(child.pid, signal);
                } catch (e) {
                    try {
                        child.kill(signal);
                    } catch (e2) {
                        // Error sending signal to child
                    }
                }
            }
        };
        const sigintListener = () => {
            console.log('\nSIGINT received by zuix-cli, attempting to stop child process...');
            forwardSignal('SIGINT');
            forwardSignal('SIGTERM');
        };
        const sigtermListener = () => {
            console.log('\nSIGTERM received by zuix-cli, attempting to stop child process...');
            forwardSignal('SIGTERM');
        };
        const cleanupAndExit = (exitCode) => {
            console.log(`CLI cleaning up listeners and exiting with code ${exitCode}.`);
            process.removeAllListeners('SIGINT');
            process.removeAllListeners('SIGTERM');
            if (child) {
                child.removeAllListeners('error');
                child.removeAllListeners('exit');
            }
            process.exit(exitCode);
        };
        process.on('SIGINT', sigintListener);
        process.on('SIGTERM', sigtermListener);
        child.on('error', (error) => {
            cleanupAndExit(1);
        });
        child.on('exit', (code, signal) => {
            const pid = child.pid;
            if (signal) {
                if (signal === 'SIGINT' || signal === 'SIGTERM') {
                    code = 0;
                }
                console.log(`Development server (PID: ${pid}) exited due to signal: ${signal}`);
            } else if (code !== null) {
                console.log(`Development server (PID: ${pid}) exited with code: ${code}`);
            } else {
                console.log(`Development server (PID: ${pid}) exited.`);
            }
            cleanupAndExit(code === null ? 1 : code);
        });
    });

program
    .command('generate')
    .alias('g')
    .addArgument(new Argument('<schematic>', 'The schematic to generate')
        .choices(['component', 'controller', 'template']))
    .addArgument(new Argument('[options...]', 'Schematic options'))
    .description('Generates and/or modifies files based on a schematic')
    .action(generate);

program
    .command('compile <inputFile> [outputFile] [pathPrefix]')
    .alias('c')
    .description('Compiles a page')
    .action(compilePage);

// load custom commands from current project folder
if (fs.existsSync(path.resolve('./.zuix.js'))) {
    require(path.resolve('./.zuix'))(program);
}

program.showSuggestionAfterError();

program.parse();
