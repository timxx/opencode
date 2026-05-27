import { afterEach, expect } from "bun:test"
import { streamText } from "ai"
import { Effect, Layer } from "effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { disposeAllInstances, provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { reply, TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"
import { Env } from "@/env"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { ModelID, ProviderID } from "@/provider/schema"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  Layer.mergeAll(
    Provider.defaultLayer,
    Env.defaultLayer,
    Plugin.defaultLayer,
    TestLLMServer.layer,
    CrossSpawnSpawner.defaultLayer,
  ),
)

it.live("custom body fields from provider options are merged into HTTP request body", () =>
  provideTmpdirServer(
    ({ llm }) =>
      Effect.gen(function* () {
        yield* llm.push(reply().text("hello").stop())

        const provider = yield* Provider.Service
        const model = yield* provider.getModel(ProviderID.make("test"), ModelID.make("test-model"))
        const result = streamText({
          model: yield* provider.getLanguage(model),
          messages: [{ role: "user", content: "hi" }],
        })

        yield* Effect.promise(() => result.text)

        const hits = yield* llm.hits
        expect(hits.length).toBeGreaterThan(0)
        const body = hits[0].body
        expect(body).toHaveProperty("custom_routing", "fast")
        expect(body).toHaveProperty("metadata")
        expect((body as any).metadata).toEqual({ source: "opencode" })
      }),
    {
      config: (url) => {
        const config = testProviderConfig(url)
        return {
          ...config,
          provider: {
            test: {
              ...config.provider.test,
              options: {
                ...config.provider.test.options,
                body: {
                  custom_routing: "fast",
                  metadata: { source: "opencode" },
                },
              },
            },
          },
        }
      },
    },
  ),
)

it.live("custom body fields can override SDK fields like custom headers can", () =>
  provideTmpdirServer(
    ({ llm }) =>
      Effect.gen(function* () {
        yield* llm.push(reply().text("works").stop())

        const provider = yield* Provider.Service
        const model = yield* provider.getModel(ProviderID.make("test"), ModelID.make("test-model"))
        const result = streamText({
          model: yield* provider.getLanguage(model),
          messages: [{ role: "user", content: "hi" }],
        })

        yield* Effect.promise(() => result.text)

        const hits = yield* llm.hits
        expect(hits.length).toBeGreaterThan(0)
        const body = hits[0].body
        // custom body overrides SDK fields (same power as custom headers)
        expect(body).toHaveProperty("model", "custom-model-override")
        expect(body).toHaveProperty("extra_field", "present")
      }),
    {
      config: (url) => {
        const config = testProviderConfig(url)
        return {
          ...config,
          provider: {
            test: {
              ...config.provider.test,
              options: {
                ...config.provider.test.options,
                body: {
                  model: "custom-model-override",
                  extra_field: "present",
                },
              },
            },
          },
        }
      },
    },
  ),
)

it.live("provider without custom body works normally", () =>
  provideTmpdirServer(
    ({ llm }) =>
      Effect.gen(function* () {
        yield* llm.push(reply().text("no body").stop())

        const provider = yield* Provider.Service
        const model = yield* provider.getModel(ProviderID.make("test"), ModelID.make("test-model"))
        const result = streamText({
          model: yield* provider.getLanguage(model),
          messages: [{ role: "user", content: "hi" }],
        })

        expect(yield* Effect.promise(() => result.text)).toBe("no body")
      }),
    {
      config: (url) => testProviderConfig(url),
    },
  ),
)
