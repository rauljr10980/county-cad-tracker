# Vehicle Routing Solver (1–2 Vehicles)

## Overview
This document describes the **mathematical model, algorithms, and reference implementation** for routing software that optimizes routes for **1 or 2 vehicles** visiting up to **50 addresses** in a single day while minimizing total travel time or distance.

The solution is based on **graph theory and discrete optimization**, using **heuristics and local search** (not genetic algorithms, not full MILP solvers). The same solver handles both cases:
- **1 vehicle → Traveling Salesman Problem (TSP)**
- **2 vehicles → Vehicle Routing Problem (VRP / mTSP)**

---

## Mathematical Model

### Graph Representation
- Let \( G = (V, E) \) be a complete weighted graph
- Nodes:
  - `0` = depot
  - `1..n` = addresses
- Edge weights:
  - \( c_{ij} \) = travel time or distance (precomputed matrix)

---

### Single Vehicle (TSP)
Find a minimum-cost Hamiltonian cycle:

\[
\min \sum c_{ij}
\]

- Starts and ends at the depot
- Visits each address exactly once
- NP-hard → solved approximately with heuristics

---

### Two Vehicles (VRP / mTSP)
Partition the addresses into two routes:

\[
\min \sum_{k=1}^{K} \sum_{(i,j) \in route_k} c_{ij}
\]

Subject to:
- Each address visited exactly once
- Each route starts and ends at its depot

**Key Insight:**
> TSP is a special case of VRP where \( K = 1 \)

---

## Algorithm Strategy

### Phase 1 — Initial Solution
- **Nearest Neighbor heuristic**
- Fast construction of a feasible route
- For 2 vehicles, split nodes between routes initially

### Phase 2 — Local Search Improvement
- **2-opt** (mandatory): improves individual routes
- **Cross-route relocate / swap** (only when `K = 2`)

### Phase 3 — Termination
- Stop when no improving move exists
- Or stop after time / iteration limit

---

## High-Level Pseudocode

```text
function solve_vrp(distance_matrix, num_vehicles, depots):
    routes = build_initial_routes(distance_matrix, num_vehicles, depots)

    improved = true
    while improved:
        improved = false

        for each route in routes:
            if two_opt(route):
                improved = true

        if num_vehicles > 1:
            if cross_route_improvement(routes):
                improved = true

    return routes, total_cost(routes)
```

---

## Heuristics

### Nearest Neighbor (Construction)

```text
start at depot
while unvisited nodes remain:
    go to nearest unvisited node
return to depot
```

---

### 2-opt (Local Search)

```text
for i < j:
    reverse route[i:j]
    if cost improves:
        accept
```

Removes crossings and shortens routes.

---

### Cross-Route Relocate (2 Vehicles)

```text
for node in route A:
    try inserting node in all positions of route B
    if total cost decreases:
        move node
```

Balances load and reduces total cost.

---

## Python Reference Implementation

### Route Cost

```python
def route_cost(route, dist):
    return sum(dist[route[i]][route[i+1]] for i in range(len(route)-1))
```

---

### Nearest Neighbor

```python
def nearest_neighbor(dist, depot, nodes):
    route = [depot]
    unvisited = set(nodes)
    current = depot

    while unvisited:
        nxt = min(unvisited, key=lambda x: dist[current][x])
        route.append(nxt)
        unvisited.remove(nxt)
        current = nxt

    route.append(depot)
    return route
```

---

### 2-opt

```python
def two_opt(route, dist):
    improved = False
    best_cost = route_cost(route, dist)

    for i in range(1, len(route) - 2):
        for j in range(i + 1, len(route) - 1):
            if j - i == 1:
                continue
            new_route = route[:i] + route[i:j][::-1] + route[j:]
            new_cost = route_cost(new_route, dist)

            if new_cost < best_cost:
                route[:] = new_route
                best_cost = new_cost
                improved = True
    return improved
```

---

### Cross-Route Relocate (2 Vehicles)

```python
def relocate(routes, dist):
    r1, r2 = routes
    best_total = route_cost(r1, dist) + route_cost(r2, dist)

    for i in range(1, len(r1) - 1):
        node = r1[i]
        new_r1 = r1[:i] + r1[i+1:]

        for j in range(1, len(r2)):
            new_r2 = r2[:j] + [node] + r2[j:]
            cost = route_cost(new_r1, dist) + route_cost(new_r2, dist)

            if cost < best_total:
                routes[0][:] = new_r1
                routes[1][:] = new_r2
                return True
    return False
```

---

### Main Solver

```python
def solve_vrp(dist, depots, num_vehicles):
    nodes = list(range(1, len(dist)))

    if num_vehicles == 1:
        routes = [nearest_neighbor(dist, depots[0], nodes)]
    else:
        half = len(nodes) // 2
        routes = [
            nearest_neighbor(dist, depots[0], nodes[:half]),
            nearest_neighbor(dist, depots[1], nodes[half:])
        ]

    improved = True
    while improved:
        improved = False
        for r in routes:
            if two_opt(r, dist):
                improved = True

        if num_vehicles > 1 and relocate(routes, dist):
            improved = True

    total_cost = sum(route_cost(r, dist) for r in routes)
    return routes, total_cost
```

---

## Time Complexity

| Component | Complexity |
|--------|------------|
| Nearest Neighbor | \(O(n^2)\) |
| 2-opt | \(O(n^2)\) per iteration |
| Relocate | \(O(n^2)\) |
| Practical total | \(O(n^2)\) |

With \( n \leq 50 \), runtime is typically **milliseconds to seconds**.

---

## Design Benefits

- Same solver for 1 or 2 vehicles
- Deterministic and fast
- Easy to extend:
  - Time windows
  - Max route length
  - Driver workload balancing
- Matches industry routing engines conceptually

---

## Summary

This solver uses:
- **Graph theory** for modeling
- **Discrete optimization** for routing
- **Local search heuristics** for efficiency

It is the correct mathematical and architectural approach for small-to-medium routing problems without overengineering.

