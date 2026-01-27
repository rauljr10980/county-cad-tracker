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
 * 2-opt local search improvement
 * Removes crossings by reversing segments until no improvement found
 * Uses incremental cost calculation for efficiency
 */
function twoOpt(route, dist) {
  let improved = true;

  while (improved) {
    improved = false;

    for (let i = 1; i < route.length - 2; i++) {
      for (let j = i + 1; j < route.length - 1; j++) {
        // Calculate cost change from reversing segment [i..j]
        const oldCost = dist[route[i - 1]][route[i]] + dist[route[j]][route[j + 1]];
        const newCost = dist[route[i - 1]][route[j]] + dist[route[i]][route[j + 1]];

        if (newCost < oldCost - 0.0001) {
          // Reverse the segment in place
          let left = i;
          let right = j;
          while (left < right) {
            const temp = route[left];
            route[left] = route[right];
            route[right] = temp;
            left++;
            right--;
          }
          improved = true;
        }
      }
    }
  }
}

/**
 * Or-opt: relocate segments of 1, 2, or 3 nodes to better positions
 * Complements 2-opt by handling moves that 2-opt cannot find
 */
function orOpt(route, dist) {
  let improved = true;

  while (improved) {
    improved = false;

    for (let segLen = 1; segLen <= 3 && !improved; segLen++) {
      for (let i = 1; i <= route.length - 1 - segLen && !improved; i++) {
        // Cost of removing segment [i..i+segLen-1] from its current position
        const removeSaving =
          dist[route[i - 1]][route[i]] +
          dist[route[i + segLen - 1]][route[i + segLen]] -
          dist[route[i - 1]][route[i + segLen]];

        for (let j = 0; j < route.length - 1; j++) {
          // Skip positions that overlap with the segment
          if (j >= i - 1 && j <= i + segLen - 1) continue;

          // Cost of inserting segment between j and j+1
          const insertCost =
            dist[route[j]][route[i]] +
            dist[route[i + segLen - 1]][route[j + 1]] -
            dist[route[j]][route[j + 1]];

          if (insertCost - removeSaving < -0.0001) {
            // Extract the segment
            const segment = route.splice(i, segLen);
            // Adjust insertion index after removal
            const insertIdx = j < i ? j + 1 : j + 1 - segLen;
            route.splice(insertIdx, 0, ...segment);
            improved = true;
            break;
          }
        }
      }
    }
  }
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
    const removeSaving = dist[r1[i - 1]][r1[i]] + dist[r1[i]][r1[i + 1]] - dist[r1[i - 1]][r1[i + 1]];

    for (let j = 0; j < r2.length - 1; j++) {
      const insertCost = dist[r2[j]][node] + dist[node][r2[j + 1]] - dist[r2[j]][r2[j + 1]];

      if (insertCost - removeSaving < -0.0001) {
        r1.splice(i, 1);
        r2.splice(j + 1, 0, node);
        improved = true;
        break;
      }
    }
    if (improved) break;
  }

  // Try moving nodes from r2 to r1
  if (!improved) {
    for (let i = 1; i < r2.length - 1; i++) {
      const node = r2[i];
      const removeSaving = dist[r2[i - 1]][r2[i]] + dist[r2[i]][r2[i + 1]] - dist[r2[i - 1]][r2[i + 1]];

      for (let j = 0; j < r1.length - 1; j++) {
        const insertCost = dist[r1[j]][node] + dist[node][r1[j + 1]] - dist[r1[j]][r1[j + 1]];

        if (insertCost - removeSaving < -0.0001) {
          r2.splice(i, 1);
          r1.splice(j + 1, 0, node);
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
 * Uses nearest-neighbor for initial solution, then 2-opt + or-opt for optimization
 */
function solveVRP(dist, depots, numVehicles) {
  const n = dist.length;
  const nodes = Array.from({ length: n - 1 }, (_, i) => i + 1);

  let bestRoutes;
  let bestCost = Infinity;

  // Try multiple starting points for nearest neighbor to find better initial solutions
  const startNodes = [depots[0]];
  // Also try starting nearest-neighbor from different nodes
  if (n <= 50) {
    // For small instances, try all starting points
    for (let s = 0; s < n; s++) {
      if (!startNodes.includes(s)) startNodes.push(s);
    }
  } else {
    // For larger instances, sample a subset
    const step = Math.max(1, Math.floor(n / 20));
    for (let s = 0; s < n; s += step) {
      if (!startNodes.includes(s)) startNodes.push(s);
    }
  }

  for (const startNode of startNodes) {
    let routes;

    if (numVehicles === 1) {
      // Build nearest-neighbor from startNode, but route must start/end at depot
      if (startNode === depots[0]) {
        routes = [nearestNeighbor(dist, depots[0], nodes)];
      } else {
        // Build NN from startNode, then restructure to start at depot
        const allNodes = [depots[0], ...nodes.filter(n => n !== startNode)];
        const nnRoute = nearestNeighbor(dist, startNode, allNodes.filter(n => n !== startNode));
        // Find depot position in route and rotate
        const depotIdx = nnRoute.indexOf(depots[0]);
        if (depotIdx > 0 && depotIdx < nnRoute.length - 1) {
          const rotated = [
            depots[0],
            ...nnRoute.slice(depotIdx + 1, nnRoute.length - 1),
            ...nnRoute.slice(1, depotIdx),
            startNode,
            depots[0]
          ];
          routes = [rotated];
        } else {
          routes = [nearestNeighbor(dist, depots[0], nodes)];
        }
      }
    } else {
      const half = Math.ceil(nodes.length / 2);
      routes = [
        nearestNeighbor(dist, depots[0], nodes.slice(0, half)),
        nearestNeighbor(dist, depots[1] !== undefined ? depots[1] : depots[0], nodes.slice(half))
      ];
    }

    // Optimize each route with 2-opt then or-opt
    for (const route of routes) {
      twoOpt(route, dist);
      orOpt(route, dist);
      twoOpt(route, dist); // Final 2-opt pass after or-opt
    }

    // Cross-route improvements for 2 vehicles
    if (numVehicles > 1) {
      let crossImproved = true;
      let crossIter = 0;
      while (crossImproved && crossIter < 50) {
        crossImproved = relocate(routes, dist);
        if (crossImproved) {
          for (const route of routes) {
            twoOpt(route, dist);
          }
        }
        crossIter++;
      }
    }

    const cost = routes.reduce((sum, route) => sum + routeCost(route, dist), 0);
    if (cost < bestCost) {
      bestCost = cost;
      bestRoutes = routes.map(r => [...r]);
    }
  }

  return {
    routes: bestRoutes,
    totalCost: bestCost,
    iterations: startNodes.length
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
    const { properties, numVehicles = 1, depotLat, depotLon, depotPropertyId } = req.body;

    console.log('[ROUTING] Received solve request:', {
      propertyCount: properties?.length || 0,
      numVehicles,
      hasDepotLat: depotLat != null,
      hasDepotLon: depotLon != null,
      depotPropertyId: depotPropertyId || 'not provided'
    });

    if (!properties || !Array.isArray(properties) || properties.length === 0) {
      return res.status(400).json({ error: 'Properties array is required' });
    }

    // For area selector optimization, enforce 25 property limit (1 depot + 24 properties)
    // This ensures only 24 properties are optimized (depot excluded from visitable stops)
    if (depotPropertyId && properties.length > 25) {
      console.error('[ROUTING] ERROR: Received more than 25 properties with depotPropertyId (area selector mode)');
      console.error('[ROUTING] Properties count:', properties.length, 'Expected max: 25 (1 depot + 24 properties)');
      return res.status(400).json({ 
        error: `Too many properties for area selector optimization. Maximum 25 properties allowed (1 starting point + 24 properties to visit). Received ${properties.length}.` 
      });
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
    // Note: depotPropertyId was already destructured from req.body on line 399
    let depotProperty;
    
    if (depotPropertyId) {
      // Use the specified property as depot
      // Try matching by id first, then by accountNumber if id doesn't match
      depotProperty = validProperties.find(p => p.id === depotPropertyId || p.accountNumber === depotPropertyId);
      if (!depotProperty) {
        console.error('[ROUTING] Depot property not found:', {
          requestedId: depotPropertyId,
          availableIds: validProperties.slice(0, 5).map(p => ({ id: p.id, accountNumber: p.accountNumber }))
        });
        return res.status(400).json({ 
          error: `Specified depot property (ID: ${depotPropertyId}) not found in selected properties`,
          availableCount: validProperties.length
        });
      }
      console.log('[ROUTING] Using specified depot property:', {
        id: depotProperty.id,
        accountNumber: depotProperty.accountNumber,
        address: depotProperty.propertyAddress || depotProperty.address
      });
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
      address: depotProperty.propertyAddress || depotProperty.address || 'Depot',
      originalId: depotProperty.id, // Keep track of original property ID
      accountNumber: depotProperty.accountNumber // Keep account number for reference
    };

    // Build locations array: [depot, ...properties to visit (EXCLUDING depot)]
    // IMPORTANT: The depot property should NOT be in the visitable stops list
    // The depot is the starting/ending point, not a stop to visit
    // Exclude the depot property from the visitable stops
    const otherProperties = validProperties.filter(p => p.id !== depotProperty.id);
    
    console.log('[ROUTING] Depot setup:', {
      depotAddress: depot.address,
      depotId: depotProperty.id,
      depotAccountNumber: depotProperty.accountNumber,
      totalPropertiesReceived: validProperties.length,
      propertiesToVisit: otherProperties.length,
      depotExcludedFromStops: true,
      note: 'Depot is the starting point only, not a visitable stop'
    });
    
    // Validate that we have properties to visit (excluding the depot)
    if (otherProperties.length === 0) {
      console.error('[ROUTING] No properties to visit (excluding depot):', {
        totalPropertiesReceived: validProperties.length,
        depotId: depotProperty.id,
        depotAccountNumber: depotProperty.accountNumber
      });
      return res.status(400).json({ 
        error: 'No properties to visit (excluding starting point). Please select at least one property other than the starting point.',
        depotProperty: {
          id: depotProperty.id,
          address: depot.address,
          accountNumber: depotProperty.accountNumber
        },
        receivedProperties: validProperties.length
      });
    }

    const locations = [
      depot,
      ...otherProperties.map(p => ({
        lat: p.latitude,
        lon: p.longitude,
        id: p.id,
        address: p.propertyAddress || p.address || '',
        accountNumber: p.accountNumber,
        property: p
      }))
    ];

    console.log('[ROUTING] Building route with:', {
      totalLocations: locations.length,
      depotAddress: depot.address,
      propertiesToVisit: otherProperties.length,
      firstProperty: otherProperties[0] ? {
        id: otherProperties[0].id,
        address: otherProperties[0].propertyAddress || otherProperties[0].address
      } : null
    });

    // Build distance matrix
    const dist = buildDistanceMatrix(locations);

    // Solve VRP
    const depots = numVehicles === 1 ? [0] : [0, 0]; // Both vehicles start at depot (index 0)
    const solution = solveVRP(dist, depots, numVehicles);
    
    console.log('[ROUTING] Solution generated:', {
      numRoutes: solution.routes.length,
      routeLengths: solution.routes.map(r => r.length),
      totalCost: solution.totalCost
    });

    // Map routes back to property data
    const optimizedRoutes = solution.routes.map((route, routeIdx) => {
      // Remove duplicate depot at the end if present (route returns to depot, but we don't need to show it twice)
      // The route structure is: [depot (0), ...stops..., depot (0)]
      // We keep the starting depot but remove the ending depot return
      let filteredRoute = route;
      if (route.length > 1 && route[0] === 0 && route[route.length - 1] === 0) {
        // Route returns to depot - remove the final depot return (it's redundant)
        filteredRoute = route.slice(0, -1);
        console.log(`[ROUTING] Route ${routeIdx + 1}: Removed duplicate depot return. Route length: ${route.length} -> ${filteredRoute.length}`);
      }
      
      const waypoints = filteredRoute.map((idx, waypointIdx) => {
        const location = locations[idx];
        const isDepot = idx === 0; // Depot is always at index 0
        return {
          ...location,
          index: idx,
          waypointIndex: waypointIdx, // Position in route (0 = start, last = end)
          isDepot,
          // Mark if this is the return-to-depot (shouldn't happen after filtering, but just in case)
          isReturnDepot: isDepot && waypointIdx === filteredRoute.length - 1 && filteredRoute.length > 1
        };
      });
      
      // Filter out return-to-depot waypoints (keep only the starting depot)
      const finalWaypoints = waypoints.filter((wp, idx) => {
        // Keep starting depot (first waypoint), but filter out return depot at the end
        if (wp.isDepot && idx > 0 && idx === waypoints.length - 1) {
          console.log(`[ROUTING] Filtering out return-to-depot waypoint at position ${idx}`);
          return false;
        }
        return true;
      });
      
      console.log(`[ROUTING] Route ${routeIdx + 1} waypoints:`, {
        originalRouteLength: route.length,
        filteredRouteLength: filteredRoute.length,
        finalWaypointsLength: finalWaypoints.length,
        depotsInRoute: finalWaypoints.filter(wp => wp.isDepot).length,
        nonDepotStops: finalWaypoints.filter(wp => !wp.isDepot).length,
        firstWaypoint: finalWaypoints[0] ? {
          isDepot: finalWaypoints[0].isDepot,
          address: finalWaypoints[0].address,
          originalId: finalWaypoints[0].originalId
        } : null,
        lastWaypoint: finalWaypoints[finalWaypoints.length - 1] ? {
          isDepot: finalWaypoints[finalWaypoints.length - 1].isDepot,
          address: finalWaypoints[finalWaypoints.length - 1].address,
          originalId: finalWaypoints[finalWaypoints.length - 1].originalId
        } : null
      });
      
      return {
        waypoints: finalWaypoints,
        cost: routeCost(filteredRoute, dist),
        distance: routeCost(filteredRoute, dist) // In kilometers
      };
    });

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

