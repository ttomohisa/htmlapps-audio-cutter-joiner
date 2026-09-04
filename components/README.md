# Reusable UI components

This directory mirrors reusable patterns from `htmlapps-template`.

- `confirm-dialog.html`: a standalone reference implementation for an accessible confirmation dialog. On narrow screens it becomes a bottom sheet with large touch targets.

The current Audio Cutter & Joiner workflow does not require a destructive confirmation dialog for normal clip editing because supported delete/edit actions are recoverable through Undo. Keep this component as a reference for future actions that genuinely require confirmation.
