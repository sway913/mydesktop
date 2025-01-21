import { rmSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import { execSync } from 'child_process';
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import pkg from './package.json'

const VERSION = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString();
const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';
const isRelease = process.env.GITHUB_WORKFLOW && process.env.GITHUB_WORKFLOW.startsWith('release');

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  return {
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src')
      },
    },
    plugins: [
      react(),
      electron({
        main: {
          // Shortcut of `build.lib.entry`
          entry: 'electron/main/app/index.ts',
          onstart(args) {
            if (process.env.VSCODE_DEBUG) {
              console.log(/* For `.vscode/.debug.script.mjs` */'[startup] Electron App')
            } else {
              args.startup()
            }
          },
          vite: {
            resolve: {
              alias: {
                '~': path.join(__dirname, 'electron'),
                'common': path.join(__dirname, 'electron/common'),
                'main': path.join(__dirname, 'electron/main'),
                'types': path.join(__dirname, 'electron/types'),
                'app': path.join(__dirname, 'electron/app'),
                'api-types': path.join(__dirname, 'electron/api-types'),
              },
            },
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
            define: {
              global: {},
              __HASH_VERSION__: !isRelease && JSON.stringify(VERSION),
              __CAN_UPGRADE__: isTest || JSON.stringify(process.env.CAN_UPGRADE === 'true'),
              __IS_NIGHTLY_BUILD__: JSON.stringify(process.env.GITHUB_WORKFLOW && process.env.GITHUB_WORKFLOW.startsWith('nightly')),
              __IS_MAC_APP_STORE__: JSON.stringify(process.env.IS_MAC_APP_STORE === 'true'),
              __SKIP_ONBOARDING_SCREENS__: JSON.stringify(process.env.MM_DESKTOP_BUILD_SKIPONBOARDINGSCREENS === 'true'),
              __DISABLE_GPU__: JSON.stringify(process.env.MM_DESKTOP_BUILD_DISABLEGPU === 'true'),
            },
          },
        },
        preload: {
          // Shortcut of `build.rollupOptions.input`.
          // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
          input: 'electron/preload/index.ts',
          vite: {
            resolve: {
              alias: {
                'common': path.join(__dirname, 'electron/common'),
                'api-types': path.join(__dirname, 'electron/api-types'),
              },
            },
            build: {
              sourcemap: sourcemap ? 'inline' : undefined, // #332
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
          },
        },
        // Ployfill the Electron and Node.js API for Renderer process.
        // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
        // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
        renderer: {},
      }),
    ],
    server: process.env.VSCODE_DEBUG && (() => {
      const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL)
      return {
        host: url.hostname,
        port: +url.port,
      }
    })(),
    clearScreen: false,
  }
})
