type DiagnosticInput = {
  code: string;
  message: string;
  details: Record<string, unknown> | null;
  sourceType: string;
  consecutiveFailures: number;
};

function detailsText(details: Record<string, unknown> | null): string {
  return JSON.stringify(details ?? {}).toLowerCase();
}

export function errorResolutionGuide(input: DiagnosticInput): {
  diagnosis: string;
  actions: string[];
} {
  const text = `${input.message.toLowerCase()} ${detailsText(input.details)}`;

  if (input.code === "FETCH_FAILED") {
    if (/enotfound|getaddrinfo|dns/.test(text)) {
      return {
        diagnosis: "DNS 无法解析目标域名。",
        actions: [
          "核对日志中的 hostname 是否正确，确认官方域名没有迁移。",
          "在 VPS 检查 DNS 解析与出口网络；若仅该域名失败，检查上游 DNS 或域名状态。",
        ],
      };
    }
    if (/etimedout|timeout|aborted|aborterror/.test(text)) {
      return {
        diagnosis: "请求在采集超时前未完成。",
        actions: [
          "核对每次 attempt 的 route 与 durationMs，判断代理和直连是否都触及超时阈值。",
          "若 direct 超时但 proxy 成功，检查 COLLECTOR_PROXY_URL 与 warp-svc；两者都超时才考虑提高该来源 timeoutMs。",
        ],
      };
    }
    if (/econnreset|socket|other side closed/.test(text)) {
      return {
        diagnosis: "远端或中间网络重置了连接。",
        actions: [
          "查看 attempts 是否每次都是 ECONNRESET；偶发失败通常等待下一轮即可。",
          "若持续发生，检查官方站是否限制数据中心 IP，并考虑代理或官方 API。",
        ],
      };
    }
    return {
      diagnosis: "采集器未能与官方来源完成网络请求。",
      actions: [
        "展开完整日志，优先查看 finalError.cause.code、hostname、syscall 与每次 attempts。",
        "若三次尝试的底层错误一致，按错误码处理网络、DNS、TLS 或访问限制问题。",
      ],
    };
  }

  if (input.code === "HTTP_ERROR") {
    const status = text.match(/status[^0-9]*(\d{3})/)?.[1];
    return {
      diagnosis: status
        ? `官方来源返回 HTTP ${status}。`
        : "官方来源返回非成功 HTTP 状态。",
      actions:
        status === "403"
          ? [
              "检查 responseBodyPreview 是否为人机验证或区域限制。",
              "确认请求头策略；持续 403 时改用官方 API 或允许的出口。",
            ]
          : status === "429"
            ? [
                "按 retry-after 降低请求频率并增加退避。",
                "检查是否有多个采集进程同时访问同一来源。",
              ]
            : [
                "检查 responseBodyPreview、responseHeaders 和 responseUrl。",
                "404 通常需要更新来源 URL；5xx 通常等待上游恢复。",
              ],
    };
  }

  if (input.code === "ACCESS_BLOCKED") {
    return {
      diagnosis: "官方页面返回验证码、人机验证或访问挑战。",
      actions: [
        "查看 responseTitle 与 responseBodyPreview 确认拦截类型。",
        "优先切换到官方 API；不要绕过站点访问控制。",
      ],
    };
  }

  if (
    input.code === "STRUCTURE_CHANGED" ||
    input.code === "EMPTY_RESULT" ||
    input.code === "MISSING_PRICE"
  ) {
    if (/duplicateidentities/.test(text)) {
      return {
        diagnosis: "多个不同套餐被归一化成了同一个套餐标识。",
        actions: [
          "查看 duplicateIdentities 中的 rawPlanName、价格和现有 canonical slug。",
          "为新套餐补充更具体且优先级更高的归一化规则，并加入回归测试。",
        ],
      };
    }
    return {
      diagnosis: "页面内容与当前解析器预期不一致。",
      actions: [
        "对照 sourceUrl 的当前页面结构与 parserVersion。",
        "根据响应摘要更新选择器或数据映射，并补充解析器回归样本。",
      ],
    };
  }

  if (input.code === "PLAN_COUNT_COLLAPSE") {
    return {
      diagnosis: "本轮解析出的套餐数量较历史值大幅下降。",
      actions: [
        "检查官方页面是否真的下架套餐。",
        "若页面仍完整，使用日志中的响应内容修复解析器，不要直接接受数量变化。",
      ],
    };
  }

  return {
    diagnosis: "采集流程抛出了未归类异常。",
    actions: [
      "从完整日志的 name、message、stack 和 cause 开始定位首个业务代码栈位置。",
      `当前来源连续失败 ${input.consecutiveFailures} 次；修复后观察下一轮是否自动转为已恢复。`,
    ],
  };
}
