const fs = require('fs');
const path = require('path');
const express = require('express');
const compression = require('compression');
const favicon = require('serve-favicon');
const Cookies = require('cookies');
const consola = require('consola');
const { createBundleRenderer } = require('vue-server-renderer');
const setupDevServer = require('./build/setup-dev-server');

// 服务器信息
const serverInfo =
  `express/${require('express/package.json').version} ` +
  `vue-server-renderer/${require('vue-server-renderer/package.json').version}`;

const app = express();

app.use(compression({ threshold: 0 })); // 对资源进行 gzip 压缩
app.use(favicon('./favicon.ico'));
app.use('/dist', express.static('./dist')); // 对静态资源处理

let renderer;
let readyPromise;

const isProd = process.env.NODE_ENV === 'production';

const createRenderer = (bundle, options) => {
  return createBundleRenderer(
    bundle,
    Object.assign(options, {
      basedir: path.resolve(__dirname, './dist'),
      runInNewContext: false,
    })
  );
};

if (isProd) {
  const bundle = require('./dist/vue-ssr-server-bundle.json');
  const template = fs.readFileSync(
    path.resolve(__dirname, './src/index.template.html'),
    'utf-8'
  );
  const clientManifest = require('./dist/vue-ssr-client-manifest.json');
  renderer = createRenderer(bundle, {
    template,
    clientManifest,
  });
} else {
  readyPromise = setupDevServer(app, (bundle, options) => {
    renderer = createRenderer(bundle, options);
  });
}

const render = (req, res) => {
  const defaultTitle = '公主连结公会战作业分享和查询';
  const { url } = req;

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Server', serverInfo);

  const cookies = new Cookies(req, res);
  const pcrWorkQuerySession = cookies.get('pcrWorkQuerySession');
  const pcrWorkQuerySessionSig = cookies.get('pcrWorkQuerySession.sig');

  if (!pcrWorkQuerySession && !pcrWorkQuerySessionSig && url !== '/login') {
    // 未登录重定向到登录页面
    res.redirect('/login');
    return;
  }

  if (pcrWorkQuerySession && pcrWorkQuerySessionSig && url === '/login') {
    // 已经登录则重定向到首页
    res.redirect('/');
    return;
  }

  // 错误处理
  const handleError = (err) => {
    if (err.url) {
      res.redirect(err.url);
    } else if (err.code === 404) {
      res.status(404).send('404 | Page Not Found');
    } else {
      res.status(500).send('500 | Internal Server Error');
      console.error(`error during render : ${req.url}`);
      console.error(err);
      console.error(err.stack);
    }
  };

  // 初始化信息
  const context = {
    title: defaultTitle,
    url,
    cookie: `pcrWorkQuerySession=${pcrWorkQuerySession};pcrWorkQuerySession.sig=${pcrWorkQuerySessionSig}`,
  };

  renderer.renderToString(context, (err, html) => {
    if (err) {
      return handleError(err);
    }
    res.send(html);
  });
};

// 对请求进行处理
const handleRequest = (req, res) => {
  if (isProd) {
    render(req, res);
  } else {
    readyPromise.then(() => {
      render(req, res);
    });
  }
};

app.get('*', handleRequest);

app.listen(8280, () => {
  isProd &&
    consola.ready({
      message: `Server listening on http://localhost:8280`,
      badge: true,
    });
});
