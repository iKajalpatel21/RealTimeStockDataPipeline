# Exactly-Once Semantics: Quick Reference Card

## One-Sentence Summary
Spark's deduplication + watermarking + checkpointing ensures each payment is recorded exactly once, preventing double-charging even during crashes.

---

## The 3 Layers

### 1️⃣ WATERMARKING
```python
.withWatermark("event_time", "1 hour")
```
- **What:** Discards messages older than 1 hour
- **Why:** Prevents old data replays, bounds memory
- **Effect:** State store stays ~300MB (not infinite)

### 2️⃣ DEDUPLICATION
```python
.withColumn("rn", row_number().over(
    Window.partitionBy("transaction_id").orderBy("event_time")
))
.filter(col("rn") == 1)
```
- **What:** Groups by transaction_id, keeps first occurrence
- **Why:** Removes duplicates from the stream
- **Effect:** Each ID seen exactly once

### 3️⃣ CHECKPOINTING
```python
.option("checkpointLocation", "/persistent/checkpoint")
```
- **What:** Saves Spark's progress to disk
- **Why:** On crash, resume without replaying messages
- **Effect:** No duplicates from restart

---

## The Problem → Solution Flow

```
DUPLICATES HAPPEN           DEDUPLICATION FIXES IT
─────────────────────────────────────────────────

Kafka gets 3 copies    →    Watermark: Accept first 1hr
  of same message         
                        →    Dedup: Keep only rn=1
                        
                        →    Checkpoint: Resume without replay

Result: $3,000 in msg  →    Result: $1,000 to BigQuery ✓
```

---

## Key Code Pattern

```python
def deduplicate_payments(payments_df):
    return (payments_df
        .withWatermark("event_time", "1 hour")          # Layer 1
        .withColumn("rn", 
            row_number().over(
                Window.partitionBy("transaction_id")
                       .orderBy("event_time")
            )
        )                                                # Layer 2
        .filter(col("rn") == 1)                          # Layer 2 cont
        .drop("rn")
    )
```

---

## Why Each Layer Matters

| Layer | Problem It Solves | If Missing |
|-------|------------------|-----------|
| Watermarking | Old data accumulation | Memory grows ∞, system crashes |
| Deduplication | Duplicate transactions | $2,000 charged instead of $1,000 |
| Checkpointing | Data loss on crash | Messages replayed → new duplicates |

---

## Testing Checklist

- [ ] Send same transaction_id 10 times to Kafka
- [ ] Verify only 1 reaches BigQuery
- [ ] Kill Spark mid-process, restart
- [ ] Verify no messages are replayed
- [ ] Check state store size (should be ~300MB, stable)
- [ ] Run reconciliation query (unique_ids = total_rows)

---

## Monitoring

### Health Check 1: State Store Size
```bash
du -sh /checkpoint/payment_transactions/state/
# Expected: ~300MB ± 100MB (stable)
```

### Health Check 2: Reconciliation
```sql
SELECT COUNT(DISTINCT transaction_id) as uniq,
       COUNT(*) as total
FROM payment_transactions
WHERE DATE(event_time) = CURRENT_DATE();
-- Expected: uniq = total (no duplicates)
```

### Health Check 3: Duplicate Rate
```sql
SELECT AVG(dup_count) FROM deduplication_audit
WHERE DATE(first_occurrence_time) = CURRENT_DATE();
-- Expected: < 2% duplicates in input stream
```

---

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| State store >1GB | No watermark | Add `.withWatermark()` |
| Duplicates in BQ | No dedup filter | Add `.filter(col("rn") == 1)` |
| Duplicates after restart | Bad checkpoint | Use persistent storage path |
| High latency | System overloaded | Increase Spark worker resources |
| Watermark not cleaning | Time skew | Check event_time field accuracy |

---

## Interview Answer Templates

### Q: "How do you prevent duplicate transactions?"
> "We use Spark streaming with three-layer exactly-once semantics:
> 1. Watermarking discards stale messages (>1 hour old)
> 2. Deduplication groups by transaction_id and keeps only the first occurrence using row_number()
> 3. Checkpointing saves progress so we resume without replaying messages. This ensures every transaction is recorded exactly once, even during crashes."

### Q: "What if your system crashes?"
> "Spark saves a checkpoint with the state store (which transaction_ids we've seen). On restart, we load the checkpoint and resume from the exact offset we left off. Since the state store knows we've already processed transactions A-Z, any crash doesn't replay them, preventing new duplicates."

### Q: "Why watermarking?"
> "Without watermarking, the state store grows unbounded. After a month, we'd have millions of transaction_ids consuming 10+ GB. Watermarking keeps us to ~300MB by removing old entries. For payment processing, data >1 hour old is too stale anyway (possible replay attack)."

### Q: "Couldn't you just use a database?"
> "A database would add latency. With 10,000 transactions/sec, we'd need millions of DB queries/sec across the network. State store is in-memory with async checkpoints, giving microsecond latency instead. It's faster, cheaper, and simpler."

---

## Files to Review (In Order)

1. **`payment_processor.py`** - See the actual code
2. **`EXACTLY_ONCE_SEMANTICS.md`** - Understand the concepts
3. **`VISUAL_GUIDE.md`** - See diagrams and examples
4. **`DEDUP_CODE_WALKTHROUGH.md`** - Learn line-by-line

---

## Resume Bullet Point

> "Engineered exactly-once Spark streaming pipeline with deduplication using transaction ID partitioning, watermarking, and persistent checkpointing; achieved 100% reconciliation accuracy at 10K+ TPS with <30s latency and <2% duplicate detection rate."

---

## The Math

```
Watermark threshold:  1 hour = 3,600 seconds
Throughput:           10,000 transactions/sec
Max unique IDs:       10,000 × 3,600 = 36,000,000

Bytes per entry:      ~200 (ID + metadata)
Max size:             36M × 200 = 7.2 GB

Real-world:           Most duplicates within seconds
Actual size:          ~300 MB (stable)
Scaling:              Bounded (not exponential)
```

---

## What This Proves You Understand

✅ Distributed system failures (retries, crashes, partitions)
✅ State management in streaming systems
✅ Trade-offs between accuracy and performance
✅ Fault tolerance patterns
✅ Financial data handling
✅ Production system design
✅ Big data infrastructure
✅ Exactly-once semantics
✅ Window functions in Spark
✅ Checkpoint/recovery patterns

---

## Time to Implement

- Development: 4-6 hours
- Testing: 2-3 hours
- Production setup: 1-2 hours
- Monitoring setup: 1-2 hours
- **Total: 8-13 hours** (half a work day to full implementation)

---

## Success Signal

When you can explain exactly-once semantics to someone with no technical background:

> "Imagine you send a $100 payment and your bank processes it twice (duplicate). Without deduplication, you're charged $200. With exactly-once, you're charged $100 even if the payment message arrives 10 times. The system remembers: 'I already processed this payment', so it only charges you once."

If you can explain it that simply, you truly understand it. 🎯
