/**
 * Vehicle Routing Problem (VRP) Solver
 * Optimizes routes for 1-2 vehicles visiting up to 500 addresses
 * Based on graph theory and discrete optimization with heuristics
 */

const express = require('express');
const router = express.Router();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Build distance matrix from coordinates
 * @param {Array} locations - Array of {lat, lon, id} objects
 * @returns {Array} 2D distance matrix
 */
function buildDistanceMatrix(locations) {
  const n = locations.length;
  const matrix = Array(n).fill(null).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 0;
      } else {
        matrix[i][j] = haversineDistance(
          locations[i].lat,
          locations[i].lon,
          locations[j].lat,
          locations[j].lon
        );
      }
    }
  }
  
  return matrix;
}

/**
 * Calculate total cost of a route
 */
function routeCost(route, dist) {
  let cost = 0;
  for (let i = 0; i < route.length - 1; i++) {
    cost += dist[route[i]][route[i + 1]];
  }
  return cost;
}

/**
 * Nearest Neighbor heuristic for initial route construction
 */
function nearestNeighbor(dist, depot, nodes) {
  const route = [depot];
  const unvisited = new Set(nodes);
  let current = depot;

  while (unvisited.size > 0) {
    let nearest = null;
    let minDist = Infinity;
    
    for (const node of unvisited) {
      if (dist[current][node] < minDist) {
        minDist = dist[current][node];
        nearest = node;
      }
    }
    
    if (nearest !== null) {
      route.push(nearest);
      unvisited.delete(nearest);
      current = nearest;
    } else {
      break;
    }
  }

  route.push(depot); // Return to depot
  return route;
}

/**
 * Find and remove the longest edge, then reconnect route optimally
 * This helps close loops when endpoints are close together and eliminates inefficient long jumps
 */
function removeLongestEdge(route, dist) {
  if (route.length <= 3) return false; // Need at least depot -> node -> depot
  
  // Find the longest edge (excluding depot connections at start/end)
  let maxDist = -1;
  let maxIdx = -1;
  
  for (let i = 0; i < route.length - 1; i++) {
    // Skip depot connections if they're not extremely long
    if ((i === 0 || i === route.length - 2) && route[i] === route[0] && route[i + 1] === route[route.length - 1]) {
      // This is a depot connection, check if it's really long
      const edgeDist = dist[route[i]][route[i + 1]];
      // Only consider depot edge if it's the absolute longest
      if (edgeDist > maxDist * 1.5) { // Depot edge must be significantly longer
        maxDist = edgeDist;
        maxIdx = i;
      }
      continue;
    }
    
    const edgeDist = dist[route[i]][route[i + 1]];
    if (edgeDist > maxDist) {
      maxDist = edgeDist;
      maxIdx = i;
    }
  }
  
  if (maxIdx === -1) return false;
  
  // If longest edge is at start (depot -> first node), try reordering to start elsewhere
  if (maxIdx === 0 && route[0] !== route[route.length - 1]) {
    // Find the node closest to the last visited node (before returning to depot)
    const lastNode = route[route.length - 2];
    let closestStart = -1;
    let minDistToLast = Infinity;
    
    for (let i = 1; i < route.length - 1; i++) {
      if (dist[route[0]][route[i]] < minDistToLast) {
        minDistToLast = dist[route[0]][route[i]];
        closestStart = i;
      }
    }
    
    if (closestStart > 0 && dist[route[closestStart]][lastNode] < maxDist) {
      // Reorder route to start from closer node
      const newRoute = [
        route[0], // Depot
        ...route.slice(closestStart, route.length - 1), // From new start to end
        ...route.slice(1, closestStart), // Remaining nodes
        route[0] // Back to depot
      ];
      route.length = 0;
      route.push(...newRoute);
      return true;
    }
  }
  
  // Split route at the longest edge
  const firstPart = route.slice(0, maxIdx + 1);
  const secondPart = route.slice(maxIdx + 1);
  
  // Remove depot from end if present
  const hasDepotAtEnd = secondPart.length > 0 && secondPart[secondPart.length - 1] === route[0];
  if (hasDepotAtEnd) {
    secondPart.pop();
  }
  
  // Try different reconnection strategies
  const options = [];
  
  // Option 1: Connect first part to reversed second part
  if (secondPart.length > 0) {
    options.push([
      ...firstPart.slice(0, -1), // Remove last node of first part
      ...secondPart.reverse(),
      firstPart[firstPart.length - 1], // Add back the last node
      route[0] // Back to depot
    ]);
  }
  
  // Option 2: Reverse first part and connect to second part
  if (firstPart.length > 2) {
    options.push([
      route[0], // Depot
      ...firstPart.slice(1, -1).reverse(), // Reverse middle nodes
      ...secondPart,
      firstPart[firstPart.length - 1], // Add last node
      route[0] // Back to depot
    ]);
  }
  
  // Option 3: Simple reversal of second part
  if (secondPart.length > 0) {
    options.push([
      ...firstPart,
      ...secondPart.reverse(),
      route[0] // Back to depot
    ]);
  }
  
  const originalCost = routeCost(route, dist);
  let bestRoute = route;
  let bestCost = originalCost;
  
  for (const option of options) {
    if (option.length === route.length) {
      const cost = routeCost(option, dist);
      if (cost < bestCost) {
        bestRoute = option;
        bestCost = cost;
      }
    }
  }
  
  if (bestCost < originalCost * 0.99) { // Only accept if at least 1% improvement
    route.length = 0;
    route.push(...bestRoute);
    return true;
  }
  
  return false;
}

/**
 * 2-opt local search improvement
 * Removes crossings and shortens routes
 */
function twoOpt(route, dist) {
  let improved = false;
  let bestCost = routeCost(route, dist);

  for (let i = 1; i < route.length - 2; i++) {
    for (let j = i + 1; j < route.length - 1; j++) {
      if (j - i === 1) continue;
      
      // Reverse segment between i and j
      const newRoute = [
        ...route.slice(0, i),
        ...route.slice(i, j + 1).reverse(),
        ...route.slice(j + 1)
      ];
      
      const newCost = routeCost(newRoute, dist);
      
      if (newCost < bestCost) {
        route.length = 0;
        route.push(...newRoute);
        bestCost = newCost;
        improved = true;
      }
    }
  }
  
  return improved;
}

/**
 * Cross-route relocate for 2 vehicles
 * Moves a node from one route to another if it improves total cost
 */
function relocate(routes, dist) {
  const [r1, r2] = routes;
  let bestTotal = routeCost(r1, dist) + routeCost(r2, dist);
  let improved = false;

  // Try moving nodes from r1 to r2
  for (let i = 1; i < r1.length - 1; i++) {
    const node = r1[i];
    const newR1 = [...r1.slice(0, i), ...r1.slice(i + 1)];

    for (let j = 1; j < r2.length; j++) {
      const newR2 = [...r2.slice(0, j), node, ...r2.slice(j)];
      const cost = routeCost(newR1, dist) + routeCost(newR2, dist);

      if (cost < bestTotal) {
        routes[0].length = 0;
        routes[0].push(...newR1);
        routes[1].length = 0;
        routes[1].push(...newR2);
        bestTotal = cost;
        improved = true;
        break; // Accept first improvement
      }
    }
    
    if (improved) break;
  }

  // Try moving nodes from r2 to r1
  if (!improved) {
    for (let i = 1; i < r2.length - 1; i++) {
      const node = r2[i];
      const newR2 = [...r2.slice(0, i), ...r2.slice(i + 1)];

      for (let j = 1; j < r1.length; j++) {
        const newR1 = [...r1.slice(0, j), node, ...r1.slice(j)];
        const cost = routeCost(newR1, dist) + routeCost(newR2, dist);

        if (cost < bestTotal) {
          routes[0].length = 0;
          routes[0].push(...newR1);
          routes[1].length = 0;
          routes[1].push(...newR2);
          bestTotal = cost;
          improved = true;
          break;
        }
      }
      
      if (improved) break;
    }
  }

  return improved;
}

/**
 * Main VRP solver
 * @param {Array} dist - Distance matrix
 * @param {Array} depots - Array of depot indices (usually [0] for single vehicle, [0, 0] for two vehicles)
 * @param {number} numVehicles - Number of vehicles (1 or 2)
 * @returns {Object} {routes, totalCost}
 */
function solveVRP(dist, depots, numVehicles) {
  const n = dist.length;
  const nodes = Array.from({ length: n - 1 }, (_, i) => i + 1); // All nodes except depot (0)

  let routes;

  // Phase 1: Initial solution using Nearest Neighbor
  if (numVehicles === 1) {
    routes = [nearestNeighbor(dist, depots[0], nodes)];
  } else {
    // For 2 vehicles, split nodes roughly in half
    const half = Math.ceil(nodes.length / 2);
    routes = [
      nearestNeighbor(dist, depots[0], nodes.slice(0, half)),
      nearestNeighbor(dist, depots[1] !== undefined ? depots[1] : depots[0], nodes.slice(half))
    ];
  }

  // Phase 2: Local search improvement
  let improved = true;
  let iterations = 0;
  const maxIterations = 100; // Prevent infinite loops

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // Apply longest edge removal first (helps close loops)
    for (const route of routes) {
      if (removeLongestEdge(route, dist)) {
        improved = true;
      }
    }

    // Apply 2-opt to each route
    for (const route of routes) {
      if (twoOpt(route, dist)) {
        improved = true;
      }
    }

    // Cross-route improvements for 2 vehicles
    if (numVehicles > 1 && relocate(routes, dist)) {
      improved = true;
    }
  }
  
  // Final pass: Apply longest edge removal one more time after all optimizations
  for (const route of routes) {
    removeLongestEdge(route, dist);
  }

  const totalCost = routes.reduce((sum, route) => sum + routeCost(route, dist), 0);

  return {
    routes,
    totalCost,
    iterations
  };
}

// ============================================================================
// API ENDPOINT
// ============================================================================

/**
 * POST /api/routing/solve
 * Solves VRP for selected properties
 * 
 * Body: {
 *   properties: [{id, latitude, longitude, address, ...}, ...],
 *   numVehicles: 1 | 2,
 *   depotLat?: number,
 *   depotLon?: number
 * }
 */
router.post('/solve', async (req, res) => {
  try {
    const { properties, numVehicles = 1, depotLat, depotLon } = req.body;

    if (!properties || !Array.isArray(properties) || properties.length === 0) {
      return res.status(400).json({ error: 'Properties array is required' });
    }

    if (properties.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 properties allowed' });
    }

    if (numVehicles !== 1 && numVehicles !== 2) {
      return res.status(400).json({ error: 'numVehicles must be 1 or 2' });
    }

    // Filter properties with valid coordinates
    const validProperties = properties.filter(p => 
      p.latitude != null && 
      p.longitude != null &&
      !isNaN(p.latitude) &&
      !isNaN(p.longitude)
    );

    if (validProperties.length === 0) {
      return res.status(400).json({ error: 'No properties with valid coordinates' });
    }

    // Use first property as depot if not specified
    const depot = {
      lat: depotLat || validProperties[0].latitude,
      lon: depotLon || validProperties[0].longitude,
      id: 'depot',
      address: 'Depot'
    };

    // Build locations array: [depot, ...properties]
    const locations = [
      depot,
      ...validProperties.map(p => ({
        lat: p.latitude,
        lon: p.longitude,
        id: p.id,
        address: p.propertyAddress || p.address || '',
        property: p
      }))
    ];

    // Build distance matrix
    const dist = buildDistanceMatrix(locations);

    // Solve VRP
    const depots = numVehicles === 1 ? [0] : [0, 0]; // Both vehicles start at depot (index 0)
    const solution = solveVRP(dist, depots, numVehicles);

    // Map routes back to property data
    const optimizedRoutes = solution.routes.map(route => ({
      waypoints: route.map(idx => ({
        ...locations[idx],
        index: idx
      })),
      cost: routeCost(route, dist),
      distance: routeCost(route, dist) // In kilometers
    }));

    res.json({
      success: true,
      numVehicles,
      totalCost: solution.totalCost,
      totalDistance: solution.totalCost, // In kilometers
      iterations: solution.iterations,
      routes: optimizedRoutes,
      depot: {
        lat: depot.lat,
        lon: depot.lon,
        address: depot.address
      }
    });
  } catch (error) {
    console.error('[ROUTING] Solve error:', error);
    res.status(500).json({ 
      error: 'Failed to solve routing problem',
      message: error.message 
    });
  }
});

module.exports = router;

