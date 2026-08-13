import { describe, expect, it } from "vitest";
import {
  GATEWAY_CAPABILITY_UNIVERFILE_CREATE,
  GATEWAY_CAPABILITY_UNIVERFILE_READ,
  GATEWAY_CAPABILITY_UNIVERFILE_VIEWER,
  GATEWAY_DESCRIPTOR_MEDIA_TYPE,
  GATEWAY_PROTOCOL_VERSION,
  GatewayDescriptorValidationError,
  resolveGatewayDescriptorViewUrl,
  validateGatewayDescriptorResponse,
} from "../src/index.js";

describe("gateway descriptor contract", () => {
  it("accepts a valid descriptor response", () => {
    expect(
      validateGatewayDescriptorResponse({
        contentType: GATEWAY_DESCRIPTOR_MEDIA_TYPE,
        body: {
          protocolVersion: GATEWAY_PROTOCOL_VERSION,
          capabilities: [GATEWAY_CAPABILITY_UNIVERFILE_CREATE, GATEWAY_CAPABILITY_UNIVERFILE_READ],
        },
        requiredCapability: GATEWAY_CAPABILITY_UNIVERFILE_CREATE,
      }),
    ).toEqual({
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
      capabilities: [GATEWAY_CAPABILITY_UNIVERFILE_CREATE, GATEWAY_CAPABILITY_UNIVERFILE_READ],
    });
  });

  it("accepts a viewer descriptor with a relative viewUrl resolved by the caller endpoint", () => {
    const descriptor = validateGatewayDescriptorResponse({
      contentType: GATEWAY_DESCRIPTOR_MEDIA_TYPE,
      body: {
        protocolVersion: GATEWAY_PROTOCOL_VERSION,
        capabilities: [GATEWAY_CAPABILITY_UNIVERFILE_READ, GATEWAY_CAPABILITY_UNIVERFILE_VIEWER],
        viewUrl: "/?file=abc",
      },
      requiredCapability: GATEWAY_CAPABILITY_UNIVERFILE_VIEWER,
    });

    expect(
      resolveGatewayDescriptorViewUrl({ endpoint: "https://gw.example/uf/abc", descriptor }),
    ).toBe("https://gw.example/?file=abc");
  });

  it("rejects unsupported protocol versions", () => {
    expect(() =>
      validateGatewayDescriptorResponse({
        contentType: GATEWAY_DESCRIPTOR_MEDIA_TYPE,
        body: { protocolVersion: 2, capabilities: [GATEWAY_CAPABILITY_UNIVERFILE_READ] },
      }),
    ).toThrowError(
      new GatewayDescriptorValidationError(
        "gateway-protocol-version-unsupported",
        "unsupported gateway protocol version: 2",
      ),
    );
  });

  it("rejects missing required capabilities", () => {
    expect(() =>
      validateGatewayDescriptorResponse({
        contentType: GATEWAY_DESCRIPTOR_MEDIA_TYPE,
        body: { protocolVersion: GATEWAY_PROTOCOL_VERSION, capabilities: [] },
        requiredCapability: GATEWAY_CAPABILITY_UNIVERFILE_READ,
      }),
    ).toThrowError(
      new GatewayDescriptorValidationError(
        "gateway-capability-missing",
        `gateway descriptor is missing capability ${GATEWAY_CAPABILITY_UNIVERFILE_READ}`,
      ),
    );
  });

  it("rejects malformed capabilities", () => {
    expect(() =>
      validateGatewayDescriptorResponse({
        contentType: GATEWAY_DESCRIPTOR_MEDIA_TYPE,
        body: { protocolVersion: GATEWAY_PROTOCOL_VERSION, capabilities: "read" },
      }),
    ).toThrowError(GatewayDescriptorValidationError);
    expect(() =>
      validateGatewayDescriptorResponse({
        contentType: GATEWAY_DESCRIPTOR_MEDIA_TYPE,
        body: { protocolVersion: GATEWAY_PROTOCOL_VERSION, capabilities: ["unknown.capability"] },
      }),
    ).toThrowError(GatewayDescriptorValidationError);
  });

  it("rejects malformed viewer declarations", () => {
    expect(() =>
      validateGatewayDescriptorResponse({
        contentType: GATEWAY_DESCRIPTOR_MEDIA_TYPE,
        body: {
          protocolVersion: GATEWAY_PROTOCOL_VERSION,
          capabilities: [GATEWAY_CAPABILITY_UNIVERFILE_VIEWER],
        },
      }),
    ).toThrowError(GatewayDescriptorValidationError);
    expect(() =>
      validateGatewayDescriptorResponse({
        contentType: GATEWAY_DESCRIPTOR_MEDIA_TYPE,
        body: {
          protocolVersion: GATEWAY_PROTOCOL_VERSION,
          capabilities: [GATEWAY_CAPABILITY_UNIVERFILE_READ],
          viewUrl: "/?file=abc",
        },
      }),
    ).toThrowError(GatewayDescriptorValidationError);
  });

  it("rejects content type mismatch", () => {
    expect(() =>
      validateGatewayDescriptorResponse({
        contentType: "application/json",
        body: {
          protocolVersion: GATEWAY_PROTOCOL_VERSION,
          capabilities: [GATEWAY_CAPABILITY_UNIVERFILE_READ],
        },
      }),
    ).toThrowError(GatewayDescriptorValidationError);
  });
});
