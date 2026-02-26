# Exactly-Once Semantics: Visual & Conceptual Guide

## The Problem Visualized: Why Duplicates Are Dangerous

### Scenario: Payment Processing

```
IDEAL WORLD (with duplicates prevented):
┌─────────────────────────────────────────────────────────────┐
│ User transfers $1,000 from Bank A to Bank B                │
└────────────────┬────────────────────────────────────────────┘
                 │
        ┌────────▼────────┐
        │ Payment Event   │
        │ transaction_id: │
        │ "xyz-789"       │
        │ amount: $1,000  │
        └────────┬────────┘
                 │
        ┌────────▼────────────────────────────┐
        │ Deduplication Layer                 │
        │ Check: Have I seen "xyz-789"?       │
        │ Answer: NO (first time)             │
        │ Action: PROCESS                     │
        └────────┬────────────────────────────┘
                 │
        ┌────────▼────────────────────────────┐
        │ BigQuery Record                     │
        │ transaction_id: xyz-789             │
        │ amount: $1,000                      │
        │ status: PROCESSED                   │
        └────────┬────────────────────────────┘
                 │
        ┌────────▼────────────────────────────┐
        │ RESULT                              │
        │ Bank A: -$1,000 ✓                   │
        │ Bank B: +$1,000 ✓                   │
        │ NET: $0 (balanced) ✓                │
        └────────────────────────────────────┘


DISASTER WORLD (without deduplication):
┌─────────────────────────────────────────────────────────────┐
│ User transfers $1,000 from Bank A to Bank B                │
│ (Network hiccup causes retry)                              │
└────────────────┬────────────────────────────────────────────┘
                 │
        ┌────────▼────────┐
        │ Payment Event #1│
        │ transaction_id: │
        │ "xyz-789"       │
        │ amount: $1,000  │
        └────────┬────────┘
                 │
        ┌────────▼────────────────────────────┐
        │ Kafka Receives Message #1           │
        │ (saving to topic)                   │
        └────────┬────────────────────────────┘
                 │
        ┌────────▼────────────────────────────┐
        │ NETWORK TIMEOUT                     │
        │ (ack not received by producer)      │
        └────────┬────────────────────────────┘
                 │
        ┌────────▼────────┐
        │ Payment Event #2│
        │ (RETRY!)        │
        │ SAME DATA:      │
        │ transaction_id: │
        │ "xyz-789"       │
        │ amount: $1,000  │
        └────────┬────────┘
                 │
        ┌────────▼────────────────────────────┐
        │ Kafka Receives Message #2           │
        │ Now has BOTH messages               │
        └────────┬────────────────────────────┘
                 │
        ┌────────▼────────────────────────────┐
        │ NO Deduplication Layer (BAD!)       │
        │ Spark: "I'll process both"          │
        │ BigQuery gets TWO records:          │
        │  - xyz-789: $1,000                  │
        │  - xyz-789: $1,000                  │
        │ Total: $2,000                       │
        └────────┬────────────────────────────┘
                 │
        ┌────────▼────────────────────────────┐
        │ DISASTER                            │
        │ Bank A: -$2,000 ❌ (too much!)     │
        │ Bank B: +$2,000 ✓                   │
        │ NET: +$1,000 (unbalanced) ❌       │
        │ Customer sues, regulatory fine      │
        └────────────────────────────────────┘
```

---

## The Solution: Three Layers of Defense

### Layer 1: Watermarking (Time-Based Filtering)

```
Current time (Spark processing): 2026-02-25 12:00:00 PM
Watermark threshold: 1 hour back = 2026-02-25 11:00:00 AM

Messages arriving at Spark:

Message A:
  event_time: 2026-02-25 11:30:00 AM
  Age: 30 minutes old
  Status: WITHIN watermark ✓
  Action: PROCESS
  
Message B:
  event_time: 2026-02-25 10:45:00 AM
  Age: 1 hour 15 minutes old
  Status: OUTSIDE watermark ❌
  Action: DISCARD (too old, suspicious)
  
Message C:
  event_time: 2026-02-25 11:59:00 AM
  Age: 1 minute old
  Status: WITHIN watermark ✓
  Action: PROCESS

RESULT:
  Messages B (too old) never reach state store
  State store size stays bounded (~100MB, not infinite)
  Memory usage = STABLE
  System = SUSTAINABLE
```

---

### Layer 2: Transaction ID Deduplication (Core Logic)

```
This is where the actual "exactly once" magic happens.

Raw messages from Kafka (in order of arrival):
┌──────────┬────────────────────┬────────────┐
│ Sequence │ transaction_id      │ amount     │
├──────────┼────────────────────┼────────────┤
│ 1        │ abc-123            │ $1,000     │
│ 2        │ def-456            │ $500       │
│ 3        │ abc-123 (RETRY)    │ $1,000     │ ← DUPLICATE
│ 4        │ xyz-789            │ $2,000     │
│ 5        │ abc-123 (RETRY2)   │ $1,000     │ ← DUPLICATE
└──────────┴────────────────────┴────────────┘

Step 1: Apply Window Specification
(Imagine grouping all messages by transaction_id)

Group abc-123:
  Messages: [seq 1, seq 3, seq 5]
  Order by event_time (earliest first)
  Assign row_number: 1, 2, 3

Group def-456:
  Messages: [seq 2]
  Order by event_time
  Assign row_number: 1

Group xyz-789:
  Messages: [seq 4]
  Order by event_time
  Assign row_number: 1

Step 2: Filter (keep only row_number == 1)

Result (output to next stage):
┌──────────┬────────────────────┬────────────┐
│ Sequence │ transaction_id      │ amount     │
├──────────┼────────────────────┼────────────┤
│ 1        │ abc-123            │ $1,000     │ ✓ KEPT (rn=1)
│ 2        │ def-456            │ $500       │ ✓ KEPT (rn=1)
│ 4        │ xyz-789            │ $2,000     │ ✓ KEPT (rn=1)
└──────────┴────────────────────┴────────────┘

Duplicates DROPPED:
  seq 3: abc-123 (was rn=2) ✗ DROPPED
  seq 5: abc-123 (was rn=3) ✗ DROPPED

TOTAL ACCURACY:
  Input total: $1,000 + $500 + $1,000 + $2,000 + $1,000 = $5,000
  After dedup: $1,000 + $500 + $2,000 = $3,500 ✓ CORRECT
```

---

### Layer 3: Checkpointing (Fault Recovery)

```
Checkpoint = Spark's "saved game" file

Timeline with Checkpoints:

01:00 PM - Spark starts processing
  Processes messages 1-1000
  Completes deduplication for batches 1-3
  SAVES CHECKPOINT: {
    "last_processed_offset": 1000,
    "state_store": {
      "abc-123": "seen",
      "def-456": "seen",
      ...
    },
    "timestamp": "2026-02-25 01:00:00"
  }

01:10 PM - Processing messages 1001-2000
  Spark crashes! ⚡ (power failure, memory error, etc.)
  Checkpoint #2 NOT saved

01:11 PM - Spark restarts
  Reads last checkpoint from disk
  Recovers state store (what it had seen)
  Resumes from offset 1001 (not from 1!)
  
  Without checkpoint:
    Spark wouldn't know where it stopped
    Would replay 1-1000 again
    Creates DUPLICATES (abc-123 counted twice)
    System fails ❌
    
  With checkpoint:
    Spark knows: "I already did 1-1000"
    Skips them
    Continues with 1001+
    NO duplicates ✓
    System survives ✓

KEY REQUIREMENT:
  Checkpoint MUST be on persistent storage
  If checkpoint is in /tmp or Docker local:
    /tmp cleared on restart → checkpoint LOST
    System replays messages → DUPLICATES
  If checkpoint is on mounted volume or cloud:
    Survives restart → NO DUPLICATES
```

---

## State Store Deep Dive: Spark's Memory

### What Spark Stores in State Store

```
State Store = Spark's persistent memory of:
  "What transaction_ids have I seen?"

Stored in checkpoint directory:
/checkpoint/payment_transactions_raw/state/

Directory structure:

/state/0/
  ├── index  (pointer to where data is)
  └── data   (the actual seen transaction_ids)

/state/1/
  ├── index
  └── data

Why multiple directories (0, 1, 2...)?
  - Each is a snapshot at different time
  - Like version control commits
  - Enables recovery to any checkpoint

State Store Contents (simplified):

Batch 0 state:
  {
    "abc-123": {seen: true, timestamp: 1000},
    "def-456": {seen: true, timestamp: 1005},
    "xyz-789": {seen: true, timestamp: 1010}
  }

Batch 1 state:
  {
    "abc-123": {seen: true, timestamp: 1000},  ← No change
    "def-456": {seen: true, timestamp: 1005},  ← No change
    "xyz-789": {seen: true, timestamp: 1010},  ← No change
    "ghi-012": {seen: true, timestamp: 1012}   ← NEW
  }

Batch 2 state:
  { ... } ← More transactions added
```

### State Store Lifecycle

```
TIME ──────────────────────────────────────────────────────────────

Batch 1:
  Input: [abc, def, xyz]
  State: abc✓ def✓ xyz✓
  Output: [abc, def, xyz]
  
Batch 2:
  Input: [abc (dup), ghi, jkl]
  State: abc✓ def✓ xyz✓ ghi✓ jkl✓
  Output: [ghi, jkl]  ← abc filtered (already in state)
  
Batch 3:
  Input: [def (dup), mno]
  State: abc✓ def✓ xyz✓ ghi✓ jkl✓ mno✓
  Output: [mno]  ← def filtered (already in state)

...

Batch 60 (1 hour later):
  Input: [pqr, abc (SUPER OLD DUP)]
  Watermark: 1 hour
  abc: event_time = batch 1 = now - 60 min
  Status: OUTSIDE watermark
  Action: DISCARD before reaching dedup
  
  Why: Spark removes old entries from state store
       when they exceed watermark threshold
  Result: abc no longer in state (not needed anyway, too old)
  
MEMORY BENEFIT:
  Without watermark: State store = 1 million transactions (huge)
  With watermark: State store = ~100K recent transactions (manageable)
```

---

## The Code Path: Step by Step

### When A Duplicate Arrives

```python
# Input to payment_processor.py:
message = {
    "transaction_id": "abc-123",
    "sender_account_id": "ACC_111111",
    "receiver_account_id": "ACC_222222",
    "amount": 1000,
    "currency": "USD",
    "device_id": "device_5000",
    "ip_address": "192.168.1.100",
    "timestamp": 1708878000000,
    "region": "US"
}
# This message is identical to one Spark saw 5 minutes ago

# ┌─────────────────────────────────────┐
# │ Step 1: Read from Kafka             │
# └─────────────────────────────────────┘
payments_df = spark.readStream...
# Result: DataFrame with message above

# ┌─────────────────────────────────────┐
# │ Step 2: Apply Watermark             │
# └─────────────────────────────────────┘
payments_with_watermark = (payments_df
    .withWatermark("event_time", "1 hour")
)
# Check: Is timestamp from last 1 hour? YES → PROCEED
# (If NO, discard before state store)

# ┌─────────────────────────────────────┐
# │ Step 3: Add Row Number              │
# └─────────────────────────────────────┘
window_spec = Window.partitionBy("transaction_id").orderBy("event_time")
.withColumn("rn", row_number().over(window_spec))

# Spark checks state store:
# "State store, do you have 'abc-123'?"
# State store says: "YES! I saw it 5 minutes ago at 10:05:00"
# Spark thinks: "OK, this is the 2nd occurrence"
# rn = 2

# ┌─────────────────────────────────────┐
# │ Step 4: Filter (rn == 1 only)       │
# └─────────────────────────────────────┘
.filter(col("rn") == 1)

# Check: Is rn == 1? NO (rn = 2)
# Action: DISCARD this row
# Row is dropped, never reaches BigQuery

# ┌─────────────────────────────────────┐
# │ Step 5: Checkpoint                  │
# └─────────────────────────────────────┘
.option("checkpointLocation", "/checkpoint/...")

# Spark updates checkpoint file:
# {
#   "messages_processed": 10050,
#   "state_store": {
#     "abc-123": {first_seen: 1708877900, processed: 1},
#     ... (unchanged from before)
#   }
# }

# ┌─────────────────────────────────────┐
# │ RESULT                              │
# └─────────────────────────────────────┘
# Duplicate message: DISCARDED ✓
# BigQuery record count: UNCHANGED ✓
# State store size: UNCHANGED ✓
# Fault recovery: ENABLED ✓
```

---

## Comparison: With vs Without Exactly-Once

### Scenario: 10,000 Transactions, 1% Duplicate Rate (100 duplicates)

```
                    WITHOUT Dedup       WITH Dedup (Exactly-Once)
─────────────────────────────────────────────────────────────────
Input messages      10,100              10,100
Duplicates in feed  100                 100
Output records      10,100              10,000
Unique txn IDs      10,100              10,000
Reconciliation      FAIL ❌             PASS ✓

BigQuery total      $10,100,000         $10,000,000
Actual transfers    $10,000,000         $10,000,000
Difference          +$100,000 ❌        $0 ✓

Audit result        "Discrepancy found" "All systems match"
Customer impact     Refund 100 txns     No action needed
Regulatory impact   Investigation       CLEAN
System reputation   DAMAGED             EXCELLENT
```

---

## The Math: Why This Scales

### State Store Size Calculation

```
Watermark = 1 hour = 3,600 seconds
Throughput = 10,000 transactions/second

Max unique transaction_ids in state store:
  10,000 txn/sec × 3,600 sec = 36,000,000 transactions

Bytes per transaction_id entry (rough):
  transaction_id: 36 bytes (UUID)
  metadata: 100 bytes
  Total: ~200 bytes per entry

Max state store size:
  36,000,000 × 200 bytes = 7.2 GB

Reality:
  Most duplicates occur within seconds (network retries)
  Not all 3600 seconds have traffic
  Actual average: ~500,000-2,000,000 concurrent IDs
  Actual state store: ~100-400 MB

This is BOUNDED and MANAGEABLE (not infinite growth)
```

---

## Quick Reference: Key Concepts

| Concept | What It Does | Why It Matters |
|---------|------------|----------------|
| **Watermark** | Discards messages older than 1 hour | Prevents old data replays, bounds state store |
| **Transaction ID** | Unique key for deduplication | Identifies which messages are duplicates |
| **Row Number** | Assigns sequence within groups | Enables filtering (keep rn=1, drop rn>1) |
| **State Store** | Persistent memory of seen IDs | Survives crashes, enables dedup across batches |
| **Checkpoint** | Saved snapshot of processing progress | Enables resume without replay on restart |
| **Filter** | Keeps only rn==1 | Actually removes duplicates from stream |
| **Exactly Once** | All three layers together | Guarantees no double-counting |

---

## Final Checklist: Is Your System Exactly-Once Ready?

- [ ] Watermark configured (1 hour or appropriate for business logic)
- [ ] Deduplication applied (window + row_number + filter)
- [ ] Checkpoint location is PERSISTENT (not /tmp)
- [ ] State store monitoring enabled
- [ ] Daily reconciliation queries running
- [ ] Fraud enrichment happens AFTER dedup
- [ ] BigQuery views for accuracy verification
- [ ] Alerts for duplicate rate > 5%
- [ ] Disaster recovery tests passing
- [ ] Audit trail enabled in BigQuery

✓ If ALL boxes checked: Your system is production-ready for financial data!
