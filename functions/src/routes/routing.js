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
 * This eliminates inefficient long jumps and connects close stops together
 */
function removeLongestEdge(route, dist) {
  if (route.length <= 3) return false; // Need at least depot -> node -> depot
  
  // Find the longest edge (prioritize non-depot edges)
  let maxDist = -1;
  let maxIdx = -1;
  let maxDistDepot = -1;
  let maxIdxDepot = -1;
  
  for (let i = 0; i < route.length - 1; i++) {
    const edgeDist = dist[route[i]][route[i + 1]];
    const isDepotEdge = (i === 0 || i === route.length - 2) && 
                        (route[i] === route[0] || route[i + 1] === route[0]);
    
    if (isDepotEdge) {
      // Track depot edges separately
      if (edgeDist > maxDistDepot) {
        maxDistDepot = edgeDist;
        maxIdxDepot = i;
      }
    } else {
      // Track non-depot edges (preferred to break)
      if (edgeDist > maxDist) {
        maxDist = edgeDist;
        maxIdx = i;
      }
    }
  }
  
  // Use longest non-depot edge if available, otherwise use depot edge
  let targetIdx = maxIdx >= 0 ? maxIdx : maxIdxDepot;
  if (targetIdx === -1) return false;
  
  const longestEdgeDist = maxIdx >= 0 ? maxDist : maxDistDepot;
  
  // Special case: If first and last stops (excluding depot) are close, 
  // break at longest edge and reconnect to form a loop
  if (route.length > 3) {
    const firstStop = route[1]; // First stop after depot
    const lastStop = route[route.length - 2]; // Last stop before depot
    const distBetweenEnds = dist[firstStop][lastStop];
    
    // If first and last stops are close (within 20% of longest edge), 
    // and longest edge is much longer, reconnect
    if (distBetweenEnds < longestEdgeDist * 0.8 && longestEdgeDist > distBetweenEnds * 2) {
      // Break at longest edge and reconnect
      if (targetIdx > 0 && targetIdx < route.length - 2) {
        // Split: [depot, ...before break, nodeA, nodeB (break), ...after break, depot]
        const beforeBreak = route.slice(1, targetIdx + 1); // From first stop to node before break
        const afterBreak = route.slice(targetIdx + 1, route.length - 1); // From node after break to last stop
        
        // Try reconnecting: start from after break, go to before break, connect ends
        const newRoute1 = [
          route[0], // Depot
          ...afterBreak,
          ...beforeBreak,
          route[0] // Back to depot
        ];
        
        // Or: start from before break, reverse order, connect ends
        const newRoute2 = [
          route[0], // Depot
          ...beforeBreak.reverse(),
          ...afterBreak.reverse(),
          route[0] // Back to depot
        ];
        
        const originalCost = routeCost(route, dist);
        const cost1 = routeCost(newRoute1, dist);
        const cost2 = routeCost(newRoute2, dist);
        
        if (cost1 < originalCost || cost2 < originalCost) {
          route.length = 0;
          route.push(...(cost1 < cost2 ? newRoute1 : newRoute2));
          return true;
        }
      }
    }
  }
  
  // General case: Break at longest edge and try reconnecting
  if (targetIdx > 0 && targetIdx < route.length - 2) {
    const firstPart = route.slice(0, targetIdx + 1);
    const secondPart = route.slice(targetIdx + 1);
    secondPart.pop(); // Remove depot from end
    
    // Try reconnecting in different ways
    const options = [
      [...firstPart, ...secondPart.reverse(), route[0]], // Reverse second part
      [route[0], ...firstPart.slice(1).reverse(), ...secondPart, route[0]], // Reverse first part
      [route[0], ...secondPart, ...firstPart.slice(1).reverse(), route[0]] // Swap and reverse
    ];
    
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
    
    if (bestCost < originalCost * 0.98) { // Only accept if at least 2% improvement
      route.length = 0;
      route.push(...bestRoute);
      return true;
    }
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

    // Find depot: if custom depot coordinates provided, find closest property
    // OR if a specific depot property ID is provided, use that
    let depotProperty;
    const { depotPropertyId } = req.body; // Optional: specific property ID to use as depot
    
    if (depotPropertyId) {
      // Use the specified property as depot
      depotProperty = validProperties.find(p => p.id === depotPropertyId);
      if (!depotProperty) {
        return res.status(400).json({ error: `Specified depot property (ID: ${depotPropertyId}) not found in selected properties` });
      }
    } else if (depotLat != null && depotLon != null) {
      // Find the closest property to the custom depot location
      let minDistance = Infinity;
      for (const prop of validProperties) {
        const dist = haversineDistance(depotLat, depotLon, prop.latitude, prop.longitude);
        if (dist < minDistance) {
          minDistance = dist;
          depotProperty = prop;
        }
      }
    } else {
      // Use first property as default depot
      depotProperty = validProperties[0];
    }

    if (!depotProperty) {
      return res.status(400).json({ error: 'Could not determine depot location' });
    }

    const depot = {
      lat: depotProperty.latitude,
      lon: depotProperty.longitude,
      id: 'depot',
      address: depotProperty.propertyAddress || depotProperty.address || 'Depot'
    };

    // Build locations array: [depot, ...other properties]
    // Exclude the depot property from the list of properties to visit
    const otherProperties = validProperties.filter(p => p.id !== depotProperty.id);
    
    const locations = [
      depot,
      ...otherProperties.map(p => ({
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

