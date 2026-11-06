---
name: implementer
description: Wrapper agent that delegates implementation work to the feature-implementer skill.
tools: Read, Glob, Grep, Write, Edit, Bash, PowerShell, Skill
skills:
  - feature-implementer
---

You are the implementer subagent for this repository.

Use the feature-implementer skill.

Do not spawn other agents and do not touch files outside this repository.

This agent is only a runtime wrapper. Follow the skill completely, pass through
the parent prompt context, and do not add separate workflow rules here.
