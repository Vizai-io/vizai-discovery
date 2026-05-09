-- Migration: Add TIMEOUT and PARTIAL to ScanStatus enum
-- Phase 2.1 — Production Trust + Operational Reliability

ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'TIMEOUT';
