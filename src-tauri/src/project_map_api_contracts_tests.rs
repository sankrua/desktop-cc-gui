use super::{build_api_contract_artifact, stable_hash};
use crate::project_map_relations::ScannedFile;
use serde_json::Value;

fn scanned_file(path: &str, extension: &str, language: &str, content: &str) -> ScannedFile {
    ScannedFile {
        id: format!("file-{}", stable_hash(path)),
        path: path.to_string(),
        basename: path.rsplit('/').next().unwrap_or(path).to_string(),
        extension: extension.to_string(),
        language: language.to_string(),
        layer: "api".to_string(),
        role: "route".to_string(),
        size_bytes: content.len() as u64,
        line_count: content.lines().count(),
        content_hash: stable_hash(content),
        parse_status: "parsed".to_string(),
    }
}

#[test]
fn strong_contract_adapters_emit_schema_backed_endpoints() {
    let openapi = r#"
openapi: 3.0.0
info:
  title: Fleet API
paths:
  /vehicles/{id}:
    get:
      operationId: getVehicle
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Vehicle'
"#;
    let proto = r#"
syntax = "proto3";
package fleet.v1;
service VehicleService {
  rpc GetVehicle (GetVehicleRequest) returns (VehicleReply);
}
"#;
    let graphql = r#"
type Query {
  vehicle(id: ID!): Vehicle
}
"#;
    let artifact = build_api_contract_artifact(
        &[
            (
                scanned_file("openapi.yaml", "yaml", "yaml", openapi),
                openapi.to_string(),
            ),
            (
                scanned_file("fleet.proto", "proto", "proto", proto),
                proto.to_string(),
            ),
            (
                scanned_file("schema.graphql", "graphql", "graphql", graphql),
                graphql.to_string(),
            ),
        ],
        "mossx-test",
        "scan-test",
        "2026-06-07T00:00:00Z",
        &[],
    );
    let endpoints = artifact.get("endpoints").and_then(Value::as_array).unwrap();
    assert!(endpoints.iter().any(|endpoint| {
        endpoint.get("protocol").and_then(Value::as_str) == Some("http")
            && endpoint.get("confidence").and_then(Value::as_str) == Some("spec")
    }));
    assert!(endpoints.iter().any(|endpoint| {
        endpoint.get("protocol").and_then(Value::as_str) == Some("grpc")
            && endpoint.get("confidence").and_then(Value::as_str) == Some("spec")
    }));
    assert!(endpoints.iter().any(|endpoint| {
        endpoint.get("protocol").and_then(Value::as_str) == Some("graphql")
            && endpoint.get("confidence").and_then(Value::as_str) == Some("spec")
    }));
    assert!(
        artifact
            .get("schemas")
            .and_then(Value::as_array)
            .unwrap()
            .len()
            >= 3
    );
    let adapters = artifact.get("adapters").and_then(Value::as_array).unwrap();
    assert!(adapters.iter().any(|adapter| {
        adapter.get("language").and_then(Value::as_str) == Some("openapi")
            && adapter.get("status").and_then(Value::as_str) == Some("active")
    }));
    assert!(adapters.iter().any(|adapter| {
        adapter.get("language").and_then(Value::as_str) == Some("protobuf")
            && adapter.get("status").and_then(Value::as_str) == Some("active")
    }));
    assert!(adapters.iter().any(|adapter| {
        adapter.get("language").and_then(Value::as_str) == Some("graphql")
            && adapter.get("status").and_then(Value::as_str) == Some("active")
    }));
}

#[test]
fn duplicate_http_contract_and_source_candidates_merge_evidence() {
    let openapi = r#"
openapi: 3.0.0
info:
  title: Users API
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        '200':
          description: ok
"#;
    let source = r#"
import express from "express";
const app = express();
app.get("/users", listUsers);
function listUsers(req, res) {
  return userService.listUsers();
}
"#;
    let artifact = build_api_contract_artifact(
        &[
            (
                scanned_file("openapi.yaml", "yaml", "yaml", openapi),
                openapi.to_string(),
            ),
            (
                scanned_file("src/routes/users.ts", "ts", "typescript", source),
                source.to_string(),
            ),
        ],
        "mossx-test",
        "scan-test",
        "2026-06-07T00:00:00Z",
        &[],
    );
    let endpoints = artifact.get("endpoints").and_then(Value::as_array).unwrap();
    let users = endpoints
        .iter()
        .filter(|endpoint| {
            endpoint.get("protocol").and_then(Value::as_str) == Some("http")
                && endpoint.get("method").and_then(Value::as_str) == Some("GET")
                && endpoint.get("path").and_then(Value::as_str) == Some("/users")
        })
        .collect::<Vec<_>>();
    assert_eq!(users.len(), 1);
    assert!(
        users[0]
            .get("evidence")
            .and_then(Value::as_array)
            .unwrap()
            .len()
            >= 2
    );
    assert!(
        users[0]
            .get("callChainIds")
            .and_then(Value::as_array)
            .unwrap()
            .len()
            <= 1
    );
}

#[test]
fn large_endpoint_fixture_preserves_group_first_artifact_shape() {
    let routes = (0..64)
        .map(|index| {
            format!(
                "app.post(\"/orders/{index}\", orderController{index});\nfunction orderController{index}(req, res) {{\n  return orderService.createOrder{index}(req.body);\n}}\n"
            )
        })
        .collect::<String>();
    let artifact = build_api_contract_artifact(
        &[(
            scanned_file("src/routes/orders.ts", "ts", "typescript", &routes),
            routes,
        )],
        "mossx-large",
        "scan-large",
        "2026-06-07T00:00:00Z",
        &[serde_json::json!({
            "path": "node_modules/express/index.js",
            "reason": "ignored by dependency directory"
        })],
    );
    let endpoints = artifact.get("endpoints").and_then(Value::as_array).unwrap();
    let groups = artifact.get("groups").and_then(Value::as_array).unwrap();
    let call_chains = artifact
        .get("callChains")
        .and_then(Value::as_array)
        .unwrap();
    assert!(endpoints.len() > 50);
    assert!(groups.iter().any(|group| {
        group.get("level").and_then(Value::as_str) == Some("protocol")
            && group
                .get("endpointIds")
                .and_then(Value::as_array)
                .map(|ids| ids.len() > 50)
                .unwrap_or(false)
    }));
    assert!(endpoints.iter().all(|endpoint| {
        endpoint
            .get("groupIds")
            .and_then(Value::as_array)
            .map(|ids| ids.len() >= 3)
            .unwrap_or(false)
    }));
    assert!(!call_chains.is_empty());
    assert!(artifact
        .get("skipped")
        .and_then(Value::as_array)
        .unwrap()
        .iter()
        .any(|item| item.get("reason").and_then(Value::as_str) == Some("dependency-directory")));
}
