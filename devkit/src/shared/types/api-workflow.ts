/**
 * 与 Chrome 扩展导出的「环境包」对齐；扩展与 DevKit 通过 JSON 交换。
 */
export const SESSION_BUNDLE_VERSION = 1 as const

export interface SessionBundleCookie {
  name: string
  domain: string
  path: string
  secure: boolean
  sameSite?: 'no_restriction' | 'lax' | 'strict' | 'unspecified'
  value: string
}

export interface SessionBundleHeaderRuleMatch {
  /** 例如 example.com，与 URL hostname 后缀匹配 */
  hostSuffix: string
  pathPrefix?: string
}

export interface SessionBundleHeaderRule {
  match: SessionBundleHeaderRuleMatch
  headers: Record<string, string>
}

export interface SessionBundle {
  version: typeof SESSION_BUNDLE_VERSION
  exportedAt: string
  cookies: SessionBundleCookie[]
  headerRules: SessionBundleHeaderRule[]
  dangerNote?: string
  /** 扩展配置的域名列表（可读后缀，便于 DevKit 展示） */
  configuredDomains?: string[]
  /** 随推送进入 DevKit 的扁平参数，将参与合并并写入请求头 */
  pushParams?: Record<string, string>
}

export interface ApiEnvironment {
  id: string
  name: string
  bundle: SessionBundle
  createdAt: string
  updatedAt: string
}

export interface ApiWorkflowStep {
  id: string
  workflowId: string
  sortOrder: number
  name: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'
  url: string
  headers: Record<string, string>
  body: string
  /** 将响应 JSON 中的路径（点号分隔，相对根对象）写入 vars[name] */
  extract: Record<string, string>
  /** 接口级默认参数（合并优先级最低层，键会作为 HTTP 头发送） */
  defaultParams: Record<string, string>
}

export interface ApiWorkflow {
  id: string
  name: string
  description: string
  environmentId: string | null
  createdAt: string
  updatedAt: string
  steps?: ApiWorkflowStep[]
}

/** 单次运行结束后的逐步摘要（可序列化） */
export interface ApiWorkflowRunStepResult {
  stepId: string
  name: string
  ok: boolean
  status?: number
  error?: string
  /** 截断后的响应预览 */
  bodyPreview?: string
}

export interface ApiWorkflowRunResult {
  ok: boolean
  log: string
  steps: ApiWorkflowRunStepResult[]
}

/** 请求 URL 主机环境（相对 prod 基准 URL 变换三级域前缀） */
export type ApiHttpHostEnv = 'prod' | 'test' | 'dev'

/** 参与扁平参数合并的层（顺序由设置决定，后者覆盖前者） */
export type ApiWorkflowParamLayer = 'push' | 'global' | 'step'

export interface ApiWorkflowRunOptions {
  httpHostEnv?: ApiHttpHostEnv
}

/** 编辑页「单步调试」传入的一步（与保存结构一致，无持久化 id） */
export interface ApiWorkflowTryStepInput {
  name: string
  method: ApiWorkflowStep['method']
  url: string
  headers: Record<string, string>
  body: string
  extract?: Record<string, string>
  defaultParams?: Record<string, string>
}

/** 单步调试返回：含与真实请求一致的 cURL（已解析模板、环境前缀、Cookie 等） */
export interface ApiWorkflowTryStepResult {
  ok: boolean
  log: string
  steps: ApiWorkflowRunStepResult[]
  curl: string
  /** 完整响应正文（界面 Pretty JSON），过长时截断 */
  responseBody?: string
  responseTruncated?: boolean
  /** 自收到响应首字节至读完 body */
  debugDurationMs?: number
  /** 响应体 UTF-8 字节数 */
  debugResponseBytes?: number
}

/** 主进程内部：执行上下文（用于模板） */
export interface ApiWorkflowRunContext {
  vars: Record<string, string>
  /** 按步骤顺序 0、1、2…，模板示例 {{idx.0.body.data.token}} */
  idx: Record<
    string,
    {
      status: number
      headers: Record<string, string>
      body: unknown
    }
  >
  steps: Record<
    string,
    {
      status: number
      headers: Record<string, string>
      body: unknown
    }
  >
}
