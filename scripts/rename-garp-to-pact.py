#!/usr/bin/env python3
"""
PACT → PACT comprehensive rename script.

Applies ordered string replacements across source, test, example, and config files.
Most-specific replacements run first to avoid double-replacing.

Usage: python3 scripts/rename-pact-to-pact.py
"""

import os
import sys

# =============================================================================
# Ordered replacements (MOST SPECIFIC → LEAST SPECIFIC)
# =============================================================================

REPLACEMENTS = [
    # ----- Full phrase (before individual words) -----
    ("Protocol for Agent Context Transfer", "Protocol for Agent Context Transfer"),

    # ----- Type/Interface names (PascalCase) -----
    ("PactCatalogEntry", "PactCatalogEntry"),
    ("PactMetadata", "PactMetadata"),
    ("PactSchema", "PactSchema"),

    ("PactDiscoverParams", "PactDiscoverParams"),
    ("PactDiscoverContext", "PactDiscoverContext"),
    ("PactDoContext", "PactDoContext"),
    ("PactInboxContext", "PactInboxContext"),
    ("PactRequestParams", "PactRequestParams"),
    ("PactRequestContext", "PactRequestContext"),
    ("PactRespondParams", "PactRespondParams"),
    ("PactRespondContext", "PactRespondContext"),
    ("PactCancelParams", "PactCancelParams"),
    ("PactCancelContext", "PactCancelContext"),
    ("PactAmendParams", "PactAmendParams"),
    ("PactAmendContext", "PactAmendContext"),
    ("PactStatusParams", "PactStatusParams"),
    ("PactStatusContext", "PactStatusContext"),
    ("PactStatusResult", "PactStatusResult"),
    ("PactThreadParams", "PactThreadParams"),
    ("PactThreadContext", "PactThreadContext"),
    ("PactThreadResult", "PactThreadResult"),
    ("PactServerConfig", "PactServerConfig"),
    ("PactServer", "PactServer"),

    # ----- Function names (camelCase) -----
    ("handlePactDiscover", "handlePactDiscover"),
    ("handlePactDo", "handlePactDo"),
    ("handlePactRequest", "handlePactRequest"),
    ("handlePactRespond", "handlePactRespond"),
    ("handlePactCancel", "handlePactCancel"),
    ("handlePactAmend", "handlePactAmend"),
    ("handlePactStatus", "handlePactStatus"),
    ("handlePactInbox", "handlePactInbox"),
    ("handlePactThread", "handlePactThread"),
    ("createPactServer", "createPactServer"),
    ("loadPactMetadata", "loadPactMetadata"),

    # ----- Import paths (with ./ or ../ prefix) -----
    ("./tools/pact-discover", "./tools/pact-discover"),
    ("./tools/pact-do", "./tools/pact-do"),
    ("./tools/pact-request", "./tools/pact-request"),
    ("./tools/pact-respond", "./tools/pact-respond"),
    ("./tools/pact-cancel", "./tools/pact-cancel"),
    ("./tools/pact-amend", "./tools/pact-amend"),
    ("./tools/pact-status", "./tools/pact-status"),
    ("./tools/pact-inbox", "./tools/pact-inbox"),
    ("./tools/pact-thread", "./tools/pact-thread"),
    ("../pact-loader", "../pact-loader"),
    ("./pact-loader", "./pact-loader"),

    # ----- Artifact filenames -----
    ("PACT.md", "PACT.md"),

    # ----- Brain → Hooks (dissolved concept) -----
    ("has_hooks", "has_hooks"),
    ("hasHooks", "hasHooks"),
    ("hooks", "hooks"),

    # ----- Variable names (camelCase) -----
    ("pactName", "pactName"),
    ("pactPath", "pactPath"),
    ("pactDirs", "pactDirs"),
    ("pactCache", "pactCache"),

    # ----- Property names (snake_case) -----
    ("pact_path", "pact_path"),
    ("pact_description", "pact_description"),
    ("pact_count", "pact_count"),

    # ----- MCP tool names (collapsed tools) -----
    ("pact_discover", "pact_discover"),
    ("pact_do", "pact_do"),

    # ----- Legacy tool names (still referenced in docs) -----
    ("pact_request", "pact_request"),
    ("pact_inbox", "pact_inbox"),
    ("pact_respond", "pact_respond"),
    ("pact_status", "pact_status"),
    ("pact_cancel", "pact_cancel"),
    ("pact_amend", "pact_amend"),
    ("pact_thread", "pact_thread"),

    # ----- Doc-specific compound phrases -----
    ("design-pact", "design-pact"),
    ("pact-init", "pact-init"),
    ("pact-team", "pact-team"),
    ("pact-README", "pact-README"),
    ("build:pact", "build:pact"),

    # ----- Environment variables -----
    ("PACT_REPO", "PACT_REPO"),
    ("PACT_USER", "PACT_USER"),
    ("PACT_LOG_LEVEL", "PACT_LOG_LEVEL"),

    # ----- Commit message prefix -----
    ("[pact]", "[pact]"),

    # ----- Directory paths (before general "pacts" replacement) -----
    ("pacts/", "pacts/"),

    # ----- Compound phrases (before individual words) -----
    ("pact", "pact"),
    ("Pact", "Pact"),
    ("pacts", "pacts"),
    ("Pacts", "Pacts"),
    ("No pact found", "No pact found"),
    ("pact-loader", "pact-loader"),

    # ----- General protocol name UPPERCASE -----
    ("PACT", "PACT"),

    # ----- PACT uppercase (after PACT.md already handled) -----
    ("PACT", "PACT"),

    # ----- Pact PascalCase (after all specific Pact* types handled) -----
    ("Pact", "Pact"),

    # ----- pacts/pact lowercase (after all specific compounds handled) -----
    ("pacts", "pacts"),
    ("pact", "pact"),

    # ----- pact lowercase catch-all (after all specific pact_* handled) -----
    ("pact", "pact"),
]

# =============================================================================
# File discovery
# =============================================================================

SKIP_DIRS = {".git", "node_modules", ".stryker-tmp", "dist", "coverage", ".beads", ".nwave"}
ROOT = "/Users/cory/pact"


def find_files(root, extensions):
    """Walk directory tree, yield files matching extensions, skip excluded dirs."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in filenames:
            if any(f.endswith(ext) for ext in extensions):
                yield os.path.join(dirpath, f)


def get_target_files():
    """Return all files that should be processed."""
    files = []

    # Source files
    files.extend(find_files(os.path.join(ROOT, "src"), [".ts"]))

    # Test files
    files.extend(find_files(os.path.join(ROOT, "tests"), [".ts"]))

    # Example files
    files.extend(find_files(os.path.join(ROOT, "examples"), [".md", ".json"]))

    # Documentation files (Wave 2)
    files.extend(find_files(os.path.join(ROOT, "docs"), [".md", ".yaml", ".json", ".feature"]))

    # Root documentation files
    for name in ["README.md", "AGENTS.md"]:
        path = os.path.join(ROOT, name)
        if os.path.exists(path):
            files.append(path)

    # Config files at root
    for name in ["package.json", "build.ts", "stryker.config.json"]:
        path = os.path.join(ROOT, name)
        if os.path.exists(path):
            files.append(path)

    # Scripts
    for f in find_files(os.path.join(ROOT, "scripts"), [".sh", ".py"]):
        files.append(f)

    return sorted(set(files))


# =============================================================================
# Replacement engine
# =============================================================================

def apply_replacements(content, replacements):
    """Apply ordered replacements to content string."""
    for old, new in replacements:
        content = content.replace(old, new)
    return content


def process_file(filepath, replacements):
    """Read file, apply replacements, write back if changed. Returns (changed, count)."""
    with open(filepath, "r", encoding="utf-8") as f:
        original = f.read()

    updated = apply_replacements(original, replacements)

    if updated != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(updated)
        # Count approximate changes
        changes = sum(
            original.count(old) for old, new in replacements if old != new and old in original
        )
        return True, changes
    return False, 0


# =============================================================================
# Main
# =============================================================================

def main():
    files = get_target_files()
    print(f"Scanning {len(files)} files...\n")

    changed_files = []
    unchanged_files = []
    total_replacements = 0

    for filepath in files:
        rel = os.path.relpath(filepath, ROOT)
        changed, count = process_file(filepath, REPLACEMENTS)
        if changed:
            changed_files.append((rel, count))
            total_replacements += count
            print(f"  CHANGED  ({count:3d} hits)  {rel}")
        else:
            unchanged_files.append(rel)

    print(f"\n{'='*60}")
    print(f"  {len(changed_files)} files changed, {len(unchanged_files)} unchanged")
    print(f"  ~{total_replacements} total replacements applied")
    print(f"{'='*60}")

    if unchanged_files:
        print(f"\nUnchanged files:")
        for f in unchanged_files:
            print(f"  {f}")


if __name__ == "__main__":
    main()
