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

const newProject = require('./commands/new-project');
const generate = require('./commands/generate');
const compilePage = require('./commands/compile-page');
const {
  copyFolder,
  generateServiceWorker,
  generateAppConfig,
  wrapCss,
  wrapDom
} = require('./common/utils');

module.exports = {
  newProject,
  generate,
  compilePage,
  copyFolder,
  generateServiceWorker,
  generateAppConfig,
  wrapCss,
  wrapDom
}
