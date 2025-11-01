import createHttpError from "http-errors";

const neteaseApi: Record<string, (params: Record<string, unknown>) => Promise<any>> = require("netease-cloud-music-api-alger");

export interface NeteaseRequestOptions {
  cookie?: string;
  realIP?: string;
  proxy?: string;
  timeout?: number;
}

const DEFAULT_PARAMS: NeteaseRequestOptions = {};

export class NeteaseClient {
  private readonly globalOptions: NeteaseRequestOptions;

  constructor(globalOptions: NeteaseRequestOptions = DEFAULT_PARAMS) {
    this.globalOptions = globalOptions;
  }

  private resolveFn(endpoint: string) {
    const fn = neteaseApi[endpoint];
    if (!fn) {
      throw createHttpError(400, `Unsupported NetEase endpoint: ${endpoint}`);
    }
    return fn;
  }

  async call<T = unknown>(endpoint: string, params: Record<string, unknown> = {}, requestOptions: NeteaseRequestOptions = {}): Promise<T> {
    const fn = this.resolveFn(endpoint);
    const mergedOptions: NeteaseRequestOptions = {
      ...this.globalOptions,
      ...requestOptions,
    };

    const response = await fn({
      ...params,
      cookie: mergedOptions.cookie,
      realIP: mergedOptions.realIP,
      proxy: mergedOptions.proxy,
      timeout: mergedOptions.timeout,
    });

    if (!response || response.status !== 200) {
      throw createHttpError(response?.status || 500, response?.body || "NetEase API error");
    }
    return response.body as T;
  }
}
