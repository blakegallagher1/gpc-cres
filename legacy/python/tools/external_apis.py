"""
Gallagher Property Company - External API Integrations
"""

from typing import Any, Dict, List, Optional, cast

import googlemaps
import httpx

from config.settings import settings


class PerplexityClient:
    """Perplexity Sonar Pro API client for real-time research"""

    def __init__(self):
        self.api_key = settings.perplexity.api_key
        self.model = settings.perplexity.model
        self.base_url = "https://api.perplexity.ai"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def search(
        self, query: str, search_recency_filter: str = "month", return_citations: bool = True
    ) -> Dict[str, Any]:
        """
        Execute a Perplexity search query

        Args:
            query: Search query
            search_recency_filter: recency filter (month, week, day, hour)
            return_citations: whether to return source citations

        Returns:
            Search results with answer and citations
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self.headers,
                json={
                    "model": self.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a commercial real estate research assistant. "
                                "Provide factual, well-sourced information with citations. "
                                "Always include specific numbers and data points when available."
                            ),
                        },
                        {"role": "user", "content": query},
                    ],
                    "search_recency_filter": search_recency_filter,
                    "return_citations": return_citations,
                    "temperature": 0.1,
                },
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()

            return {
                "answer": data["choices"][0]["message"]["content"],
                "citations": data.get("citations", []),
                "model": data.get("model"),
                "usage": data.get("usage", {}),
            }

    async def research_parcel(
        self, address: str, parcel_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Research a specific parcel"""
        parcel_line = f"Parcel ID/PRONO: {parcel_id}.\n" if parcel_id else ""
        query = f"""
        Research the commercial real estate parcel at {address} in East Baton Rouge Parish, Louisiana.
        {parcel_line}

        Provide information on:
        1. Parcel size (acres/square feet)
        2. Current zoning designation and permitted uses
        3. Current owner and ownership history
        4. Tax assessment value
        5. FEMA flood zone designation
        6. Available utilities
        7. Recent comparable sales in the area
        8. Submarket conditions (vacancy, rents, absorption)

        Be specific with numbers and cite sources.
        """
        return await self.search(query, search_recency_filter="year")

    async def research_market(self, submarket: str, property_type: str) -> Dict[str, Any]:
        """Research market conditions"""
        query = f"""
        Research the {property_type} market in {submarket}, Louisiana.

        Provide:
        1. Current vacancy rate
        2. Average rental rates ($/SF/month or $/unit/month)
        3. Rent growth year-over-year
        4. Absorption rate
        5. Cap rate range for recent transactions
        6. Development pipeline
        7. Key demand drivers
        8. Economic indicators affecting the market

        Be specific with current data and cite sources.
        """
        return await self.search(query, search_recency_filter="month")

    async def research_comparables(
        self, address: str, property_type: str, radius_miles: float = 3.0
    ) -> Dict[str, Any]:
        """Find comparable sales/leases"""
        query = f"""
        Find comparable {property_type} sales and leases within {radius_miles} miles of {address} in Louisiana.

        For each comparable, provide:
        1. Property address
        2. Sale/lease date
        3. Sale price or lease rate
        4. Property size (SF or units)
        5. Price per SF or per unit
        6. Cap rate (if known)
        7. Key property characteristics

        Focus on transactions within the last 12-24 months.
        """
        return await self.search(query, search_recency_filter="year")


class GoogleMapsClient:
    """Google Maps API client for location analysis"""

    def __init__(self):
        self.api_key = settings.google.maps_api_key
        if not self.api_key:
            self.client = None
            return
        try:
            self.client = googlemaps.Client(key=self.api_key)
        except ValueError:
            self.client = None

    async def geocode_address(self, address: str) -> Optional[Dict[str, Any]]:
        """Geocode an address to lat/lng"""
        if not self.client:
            return None

        try:
            result = self.client.geocode(address)
            if result:
                location = result[0]["geometry"]["location"]
                return {
                    "formatted_address": result[0]["formatted_address"],
                    "latitude": location["lat"],
                    "longitude": location["lng"],
                    "place_id": result[0]["place_id"],
                }
        except Exception as e:  # pylint: disable=broad-exception-caught
            print(f"Geocoding error: {e}")
        return None

    async def get_nearby_places(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int = 1609,  # 1 mile
        place_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Get nearby points of interest"""
        if not self.client:
            return []

        try:
            places = self.client.places_nearby(
                location=(latitude, longitude), radius=radius_meters, type=place_type
            )

            results = []
            for place in places.get("results", [])[:20]:
                results.append(
                    {
                        "name": place["name"],
                        "place_id": place["place_id"],
                        "types": place["types"],
                        "rating": place.get("rating"),
                        "user_ratings_total": place.get("user_ratings_total"),
                        "vicinity": place.get("vicinity"),
                    }
                )
            return results
        except Exception as e:  # pylint: disable=broad-exception-caught
            print(f"Places error: {e}")
            return []

    async def analyze_location_access(self, address: str, property_type: str) -> Dict[str, Any]:
        """Analyze location accessibility and nearby amenities"""
        geocode = await self.geocode_address(address)
        if not geocode:
            return {"error": "Could not geocode address"}

        lat, lng = geocode["latitude"], geocode["longitude"]

        # Get nearby amenities based on property type
        amenities = {}

        if property_type in ["mobile_home_park", "multifamily"]:
            # For residential, look for schools, grocery, retail
            amenities["schools"] = await self.get_nearby_places(lat, lng, place_type="school")
            amenities["grocery"] = await self.get_nearby_places(
                lat, lng, place_type="grocery_or_supermarket"
            )
            amenities["shopping"] = await self.get_nearby_places(
                lat, lng, place_type="shopping_mall"
            )

        if property_type in ["flex_industrial", "warehouse"]:
            # For industrial, look for highways, ports, rail
            amenities["highway_access"] = await self.get_nearby_places(
                lat, lng, radius_meters=5000, place_type="route"
            )

        if property_type in ["retail", "small_commercial"]:
            # For retail, look for traffic generators
            amenities["restaurants"] = await self.get_nearby_places(
                lat, lng, place_type="restaurant"
            )
            amenities["retail"] = await self.get_nearby_places(lat, lng, place_type="store")

        return {
            "geocode": geocode,
            "amenities": amenities,
            "analysis_summary": (
                "Location analyzed with "
                f"{sum(len(v) for v in amenities.values())} nearby amenities identified"
            ),
        }

    async def get_distance_matrix(
        self, origins: List[str], destinations: List[str]
    ) -> Dict[str, Any]:
        """Get distance and time between locations"""
        if not self.client:
            return {"error": "Google Maps client not initialized"}

        try:
            result = self.client.distance_matrix(
                origins=origins, destinations=destinations, mode="driving"
            )
            return cast(Dict[str, Any], result)
        except Exception as e:  # pylint: disable=broad-exception-caught
            return {"error": str(e)}


class FEMAClient:
    """FEMA Flood Map API client"""

    def __init__(self):
        self.base_url = "https://msc.fema.gov/portal/api"

    async def get_flood_zone(self, latitude: float, longitude: float) -> Dict[str, Any]:
        """Get FEMA flood zone for a location"""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/floodzone",
                    params={"lat": latitude, "lng": longitude},
                    timeout=30.0,
                )
                response.raise_for_status()
                return cast(Dict[str, Any], response.json())
            except Exception as e:  # pylint: disable=broad-exception-caught
                return {"error": str(e), "zone": "Unknown", "sfha": False}

    async def analyze_flood_risk(self, address: str) -> Dict[str, Any]:
        """Complete flood risk analysis for an address"""
        # First geocode the address
        maps_client = GoogleMapsClient()
        geocode = await maps_client.geocode_address(address)

        if not geocode:
            return {
                "address": address,
                "error": "Could not geocode address",
                "flood_insurance_required": False,
            }

        # Get flood zone data
        flood_data = await self.get_flood_zone(geocode["latitude"], geocode["longitude"])

        zone = flood_data.get("zone", "Unknown")
        sfha = zone.startswith(("A", "V"))  # Special Flood Hazard Area

        zone_descriptions = {
            "AE": "1% annual chance flood hazard, base flood elevations determined",
            "AH": "1% annual chance flood hazard, shallow flooding, base flood elevations determined",
            "AO": "1% annual chance flood hazard, shallow flooding, no base flood elevations",
            "A": "1% annual chance flood hazard, no base flood elevations determined",
            "VE": "Coastal high hazard area, 1% annual chance flood hazard with velocity",
            "V": "Coastal high hazard area, no base flood elevations determined",
            "X": "Minimal flood hazard (0.2% annual chance or less)",
            "D": "Undetermined flood hazard",
        }

        return {
            "address": address,
            "latitude": geocode["latitude"],
            "longitude": geocode["longitude"],
            "fema_flood_zone": zone,
            "zone_description": zone_descriptions.get(zone, "Unknown zone type"),
            "base_flood_elevation": flood_data.get("base_flood_elevation"),
            "property_elevation": flood_data.get("ground_elevation"),
            "special_flood_hazard_area": sfha,
            "flood_insurance_required": sfha,
            "estimated_premium": self._estimate_flood_premium(sfha, zone),
            "data_source": "FEMA National Flood Hazard Layer",
        }

    def _estimate_flood_premium(self, sfha: bool, zone: str) -> Optional[float]:
        """Rough estimate of flood insurance premium"""
        if not sfha:
            return 500  # Preferred risk policy

        zone_premiums = {"AE": 2500, "AH": 2200, "AO": 2000, "A": 2800, "VE": 4500, "V": 5000}
        return zone_premiums.get(zone, 3000)


# Global client instances
perplexity = PerplexityClient()
gmaps = GoogleMapsClient()
fema = FEMAClient()
