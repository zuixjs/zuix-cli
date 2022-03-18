#!/usr/bin/env node

/*
 * Copyright 2020-2022 G-Labs. All Rights Reserved.
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
const child_process = require("child_process");
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
        // todo: should check if it's a zuix.js project
        child_process.execSync('npm start',{
            stdio:[0, 1, 2]
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
