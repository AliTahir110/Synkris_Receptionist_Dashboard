import json
import os

from pms.mock import MockPMS

SEED_CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_config.json")
DEFAULT_TO_NUMBER = os.environ.get("DEFAULT_TO_NUMBER", "+441162345678")
TENANTS = {}


def _load_seed_config():
    with open(SEED_CONFIG, encoding="utf-8") as config_file:
        return json.load(config_file)


def get_tenant(to_number):
    to_number = to_number or DEFAULT_TO_NUMBER
    if to_number in TENANTS:
        return TENANTS[to_number]

    config = _load_seed_config()
    if config["practice"]["phone"] != to_number:
        return None

    tenant = (config, MockPMS(config))
    TENANTS[to_number] = tenant
    return tenant
