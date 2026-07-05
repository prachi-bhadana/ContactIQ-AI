from sqlalchemy import Column,Integer,String
from database import Base


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)

    full_name = Column(String)
    first_name = Column(String)
    last_name = Column(String)

    email = Column(String)
    alternate_email = Column(String)

    phone = Column(String)
    alternate_phone = Column(String)

    organization = Column(String)

    designation = Column(String)
    experience_years = Column(String)
    experience_months = Column(String)
    industry = Column(String)
    city = Column(String)
    state = Column(String)
    country = Column(String)
    nationality = Column(String)
    linkedin = Column(String)
    website = Column(String)
    skills = Column(String)
    notes = Column(String)
    confidence = Column(Integer)