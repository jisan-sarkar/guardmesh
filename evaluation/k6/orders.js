import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    orders: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.RATE ?? 5),
      timeUnit: "1s",
      duration: __ENV.DURATION ?? "30s",
      preAllocatedVUs: Number(__ENV.VUS ?? 5),
      maxVUs: Number(__ENV.MAX_VUS ?? 20),
    },
  },
};

export default function () {
  const baseUrl = __ENV.BASE_URL ?? "http://localhost";
  const token = __ENV.ACCESS_TOKEN;
  if (!token) throw new Error("ACCESS_TOKEN is required");

  const response = http.post(
    `${baseUrl}/api/orders`,
    JSON.stringify({
      requestFingerprint: `k6-${__VU}-${__ITER}`,
      items: [{ sku: "sku-1", quantity: 1 }],
    }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  check(response, {
    "order request is accepted or denied explicitly": (result) =>
      result.status === 201 || result.status === 403,
  });
}
